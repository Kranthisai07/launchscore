import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AxeBuilder } from "@axe-core/playwright";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright";
import { startFixtureServer, type FixtureServer } from "../fixtures/server.js";
import { AXE_TAGS } from "../src/axe.js";
import { renderCardImages } from "../src/report/card.js";
import { renderHtmlReport } from "../src/report/html.js";
import { buildReport, type Report } from "../src/report/json.js";
import { runScan } from "../src/runner.js";
import { finding, makeReport } from "./helpers/report.js";

// The report is opened for real in Chromium: phone width, nothing fetched, nothing executed, accessible.
let browser: Browser;
let dir: string;
let servers: FixtureServer[];
const files: Record<string, string> = {};

const hostile = (label: string) => `<script>window.pwned="${label}"</script><img src=x onerror="window.pwned='${label}'">`;
const hostileReport = (): Report =>
  makeReport({
    findings: [finding(hostile("a"), "critical", hostile("b"), { why: hostile("c"), fix: hostile("d"), checkId: hostile("e") })],
    detected: [{ checkId: "SEC-005", stack: hostile("f"), note: hostile("g") }],
    notTested: [{ checkId: "X-1", title: hostile("h"), reason: hostile("i") }],
  });

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "launchscore-html-"));
  servers = await Promise.all([startFixtureServer("good"), startFixtureServer("bad")]);
  const [good, bad] = servers;
  for (const [name, server] of [["good", good], ["bad", bad]] as const) {
    const report = buildReport(await runScan(server.url + "/", { skipPerformance: true }));
    const cardPng = (await renderCardImages(report)).landscape;
    files[name] = path.join(dir, `${name}.html`);
    await writeFile(files[name], renderHtmlReport(report, { cardPng, version: "0.0.1" }));
  }
  files.hostile = path.join(dir, "hostile.html");
  await writeFile(files.hostile, renderHtmlReport(hostileReport(), { version: "0.0.1" }));
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await Promise.all(servers.map((s) => s.close()));
  await rm(dir, { recursive: true, force: true });
});

async function open(name: string, width: number) {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  const requests: string[] = [];
  const problems: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("dialog", (d) => {
    problems.push(`dialog: ${d.message()}`);
    void d.dismiss();
  });
  await page.goto(pathToFileURL(files[name]).href);
  return { page, requests, problems, context };
}

describe.each([["good"], ["bad"]])("the %s fixture's report in a real browser", (name) => {
  it.each([375, 1100])("has no horizontal scroll at %i px", async (width) => {
    const { page, context } = await open(name, width);
    const overflow = Number(await page.evaluate("document.documentElement.scrollWidth - window.innerWidth"));
    expect(overflow).toBeLessThanOrEqual(0);
    await context.close();
  });

  it("asks for nothing beyond the file itself and logs no errors", async () => {
    const { requests, problems, context } = await open(name, 375);
    expect(requests.filter((u) => !u.startsWith("file:") && !u.startsWith("data:"))).toEqual([]);
    expect(problems).toEqual([]);
    await context.close();
  });

  it("has no accessibility violations (WCAG A and AA)", async () => {
    const { page, context } = await open(name, 375);
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`)).toEqual([]);
    await context.close();
  });

  it("shows the embedded card image fully loaded", async () => {
    const { page, context } = await open(name, 375);
    const loaded = await page.evaluate("(() => { const i = document.querySelector('img.card-img'); return !!i && i.complete && i.naturalWidth === 1200; })()");
    expect(loaded).toBe(true);
    await context.close();
  });
});

describe("a hostile report in a real browser", () => {
  it("runs nothing and injects nothing", async () => {
    const { page, problems, context } = await open("hostile", 375);
    expect(await page.evaluate("typeof window.pwned")).toBe("undefined");
    expect(await page.evaluate("document.querySelectorAll('script, img[src=x]').length")).toBe(0);
    expect(problems).toEqual([]);
    // the payload is visible as plain text instead
    expect(await page.locator("body").innerText()).toContain("<script>window.pwned=");
    await context.close();
  });

  it("still has no horizontal scroll, however long the strings", async () => {
    const { page, context } = await open("hostile", 375);
    expect(Number(await page.evaluate("document.documentElement.scrollWidth - window.innerWidth"))).toBeLessThanOrEqual(0);
    await context.close();
  });
});
