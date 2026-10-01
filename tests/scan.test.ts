import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startFixtureServer, type FixtureServer } from "../fixtures/server.js";
import { normalizeUrl, scanAndWrite } from "../src/scan.js";
import { ReportSchema } from "../src/report/json.js";

describe("normalizeUrl", () => {
  it.each([
    ["https://mysite.com", "https://mysite.com/"],
    ["mysite.com", "https://mysite.com/"],
    ["localhost:3000", "http://localhost:3000/"],
    ["127.0.0.1:8080/x", "http://127.0.0.1:8080/x"],
    ["http://mysite.com/a?b=1", "http://mysite.com/a?b=1"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  it("rejects non-web schemes and nonsense", () => {
    expect(() => normalizeUrl("ftp://x.com")).toThrow(/http and https/);
    expect(() => normalizeUrl("")).toThrow(/web address/);
  });
});

describe("scanAndWrite", () => {
  let bad: FixtureServer;
  let dir: string;

  beforeAll(async () => {
    bad = await startFixtureServer("bad");
    dir = await mkdtemp(path.join(os.tmpdir(), "launchscore-scan-"));
  });

  afterAll(async () => {
    await bad.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("writes the report and both cards and summarizes the score", async () => {
    const summary = await scanAndWrite(bad.url, dir, { skipPerformance: true });
    expect(summary).toMatchObject({
      score: 4,
      verdict: "BLOCKED: CRITICAL ISSUE",
      partial: true,
      untestedCategories: ["performance"],
      findings: 28,
      checksRun: 17,
    });
    expect(summary.cardError).toBeUndefined();
    expect(path.basename(summary.htmlPath)).toBe("launchscore-report.html");
    const html = await readFile(summary.htmlPath, "utf8");
    expect(html).toContain("127.0.0.1");
    expect(html).toContain("BLOCKED: CRITICAL ISSUE");
    expect(html).toContain('<img class="card-img"'); // the landscape card is embedded
    expect(html).toContain("data:image/png;base64,");
    expect(summary.cardPaths.map((p) => path.basename(p))).toEqual(["launchscore-card.png", "launchscore-card-square.png"]);
    for (const file of summary.cardPaths) expect(existsSync(file)).toBe(true);

    const report = ReportSchema.parse(JSON.parse(await readFile(summary.reportPath, "utf8")));
    expect(report).toMatchObject({ score: 4, verdict: "BLOCKED: CRITICAL ISSUE", partial: true, verified: false });
    expect(report.categories.map((c) => [c.name, c.score])).toEqual([
      ["security", 0],
      ["seo", 0],
      ["accessibility", 25],
      ["performance", null],
      ["hygiene", 0],
    ]);
  });

  it("can skip the cards", async () => {
    const other = await mkdtemp(path.join(os.tmpdir(), "launchscore-scan-"));
    try {
      const summary = await scanAndWrite(bad.url, other, { writeCards: false, skipPerformance: true });
      expect(summary.cardPaths).toEqual([]);
      expect(existsSync(path.join(other, "launchscore-report.json"))).toBe(true);
      expect(existsSync(path.join(other, "launchscore-card.png"))).toBe(false);
      // the web report is still written, just without the picture
      const html = await readFile(summary.htmlPath, "utf8");
      expect(html).toContain('<section id="fix-first"');
      expect(html).not.toContain("<img");
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });
});
