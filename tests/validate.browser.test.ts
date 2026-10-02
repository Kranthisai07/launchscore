import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startFixtureServer, type FixtureServer } from "../fixtures/server.js";
import { FAKE_SECRETS } from "../fixtures/secrets.js";
import { parseSiteList, runValidation, tally, type ValidationRun } from "../scripts/validate-lib.js";
import { scanAndWrite } from "../src/scan.js";

// The real harness, on the two local fixtures: real scans, real files. Lighthouse is skipped here only to
// keep CI quick (the harness itself always runs it).
let good: FixtureServer;
let bad: FixtureServer;
let out: string;
let run: ValidationRun;
const lines: string[] = [];

const allFiles = async (dir: string): Promise<string[]> =>
  (await readdir(dir, { withFileTypes: true })).flatMap((e) => (e.isDirectory() ? [] : [path.join(dir, e.name)])).concat(
    ...(await Promise.all((await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => allFiles(path.join(dir, e.name))))),
  );

beforeAll(async () => {
  [good, bad] = await Promise.all([startFixtureServer("good"), startFixtureServer("bad")]);
  out = await mkdtemp(path.join(os.tmpdir(), "launchscore-validation-"));
  const { urls } = parseSiteList(`# fixtures\n${good.url}\n${bad.url}\n`);
  run = await runValidation({
    urls,
    outDir: path.join(out, "validation"),
    delayMs: 0,
    scanOptions: { skipPerformance: true },
    deps: { scan: scanAndWrite, log: (l) => lines.push(l), isIgnored: async () => true },
  });
});

afterAll(async () => {
  await Promise.all([good.close(), bad.close()]);
  await rm(out, { recursive: true, force: true });
});

describe("the harness on the good and bad fixtures", () => {
  it("gives each site its own folder with the four outputs", async () => {
    const dirs = run.results.map((r) => r.dir);
    expect(new Set(dirs).size).toBe(2);
    for (const dir of dirs) {
      const files = (await readdir(path.join(out, "validation", dir))).sort();
      expect(files).toEqual(["launchscore-card-square.png", "launchscore-card.png", "launchscore-report.html", "launchscore-report.json"]);
    }
  });

  it("finds nothing on the good fixture and 27 things on the bad one", () => {
    const [g, b] = run.results;
    expect(g.report!.findings).toHaveLength(0);
    expect(b.report!.findings).toHaveLength(27);
    expect(g.crashes).toEqual([]);
    expect(b.crashes).toEqual([]);
  });

  it("writes one review row per finding, each with an empty verdict, and lists the clean site", async () => {
    const md = await readFile(run.reviewPath, "utf8");
    const rows = md.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Site"));
    expect(rows).toHaveLength(27);
    for (const row of rows) expect(row).toMatch(/\|  \|$/);
    expect(md).toContain(`Scanned with no findings: ${run.results[0].host}`);
    expect(md).toContain("| critical | A secret Stripe payment key is visible in your website's code |");
  });

  it("logs a line per site and writes the summary", async () => {
    expect(lines.filter((l) => l.startsWith("[")).map((l) => l.slice(0, 5))).toEqual(["[1/2]", "[2/2]"]);
    expect(lines.join("\n")).toContain("0 crashes");
    const summary = await readFile(run.summaryPath, "utf8");
    expect(summary).toContain("2 of 2 sites scanned");
    expect(summary).toContain("27 findings");
    expect(summary).toContain("| SEC-001 | 2 | 1 |");
    expect(summary).toContain("skipped (--no-perf): 2"); // the test-only override, recorded honestly
    expect(run.summary.byCheck.reduce((n, c) => n + c.findings, 0)).toBe(27);
  });

  it("puts no full secret anywhere in the output", async () => {
    for (const file of await allFiles(path.join(out, "validation"))) {
      if (file.endsWith(".png")) continue;
      const text = await readFile(file, "utf8");
      expect(text, file).not.toContain(FAKE_SECRETS.STRIPE_SK_LIVE);
      expect(text, file).not.toContain(FAKE_SECRETS.SUPABASE_SERVICE_JWT);
    }
  });

  it("keeps everything inside the output folder", async () => {
    expect(await readdir(out)).toEqual(["validation"]);
    expect((await readdir(path.join(out, "validation"))).sort()).toEqual([...run.results.map((r) => r.dir), "review.md", "summary.md"].sort());
  });

  it("can be marked up and tallied: every row marked TP gives 100% precision", async () => {
    const md = (await readFile(run.reviewPath, "utf8")).replace(/\|  \|$/gm, "| TP |");
    const t = tally(md);
    expect(t.overall).toMatchObject({ TP: 27, FP: 0, unsure: 0, unmarked: 0, precision: 1 });
    expect(t.perCheck.find((c) => c.checkId === "SEC-001")).toMatchObject({ TP: 2 });
  });
});
