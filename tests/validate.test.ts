import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  crashesOf,
  ensureIgnored,
  escapeCell,
  NotIgnoredError,
  normalizeVerdict,
  parseReview,
  parseSiteList,
  reviewMarkdown,
  runValidation,
  siteDirName,
  summarize,
  summaryMarkdown,
  summaryText,
  tally,
  tallyMarkdown,
  tallyText,
  type SiteResult,
  type ValidationDeps,
} from "../scripts/validate-lib.js";
import type { Report } from "../src/report/json.js";
import type { ScanOptions, ScanSummary } from "../src/scan.js";
import { finding, makeReport } from "./helpers/report.js";

const tmpDirs: string[] = [];
const tmp = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "launchscore-validate-"));
  tmpDirs.push(dir);
  return dir;
};
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("parseSiteList", () => {
  it("reads one URL per line and ignores blanks, comments and surrounding spaces", () => {
    const { urls, errors } = parseSiteList("# my sites\n\n  https://a.example/  \nhttps://b.example/page\n   # another note\n");
    expect(urls).toEqual(["https://a.example/", "https://b.example/page"]);
    expect(errors).toEqual([]);
  });

  it("accepts Windows line endings and a missing final newline", () => {
    expect(parseSiteList("https://a.example\r\nhttps://b.example").urls).toEqual(["https://a.example/", "https://b.example/"]);
  });

  it("adds https to a bare address, and http to localhost", () => {
    expect(parseSiteList("mysite.com\nlocalhost:3000").urls).toEqual(["https://mysite.com/", "http://localhost:3000/"]);
  });

  it("drops duplicates, even when written differently", () => {
    expect(parseSiteList("https://a.example\na.example\nhttps://a.example/\nhttps://A.example/").urls).toEqual(["https://a.example/"]);
  });

  it("reports a bad line with its number and carries on", () => {
    const { urls, errors } = parseSiteList("https://a.example\nftp://files.example\nnot a url at all\nhttps://b.example");
    expect(urls).toEqual(["https://a.example/", "https://b.example/"]);
    expect(errors.map((e) => [e.line, e.text])).toEqual([
      [2, "ftp://files.example"],
      [3, "not a url at all"],
    ]);
    expect(errors[0].message).toMatch(/http and https/);
  });

  it("gives an empty list for an empty file", () => {
    expect(parseSiteList("")).toEqual({ urls: [], errors: [] });
  });
});

describe("siteDirName", () => {
  const name = (url: string, used = new Set<string>()) => siteDirName(url, used);

  it("uses the host, lowercased", () => {
    expect(name("https://WWW.Example.com/some/path?q=1")).toBe("www.example.com");
  });

  it("keeps a port apart from the same host without one", () => {
    expect(name("http://localhost:3000/")).toBe("localhost_3000");
    expect(name("http://localhost:3001/")).toBe("localhost_3001");
  });

  it("makes IPv6 and other unusual hosts safe", () => {
    expect(name("http://[::1]:8080/")).toBe("__1_8080");
    expect(name("https://xn--bcher-kva.example/")).toBe("xn--bcher-kva.example");
  });

  it("numbers a second URL on the same host", () => {
    const used = new Set<string>();
    expect([name("https://a.example/x", used), name("https://a.example/y", used), name("https://a.example/z", used)]).toEqual([
      "a.example",
      "a.example-2",
      "a.example-3",
    ]);
  });

  it.each(["https://a.example/../../etc/passwd", "https://a.example/%2e%2e/%2e%2e/x", "http://127.0.0.1/"])("never produces a path that can leave the folder (%s)", (url) => {
    const dir = name(url);
    expect(dir).not.toMatch(/[\\/]/);
    expect(dir).not.toMatch(/^\.+$/);
    expect(path.join("out", dir).startsWith("out")).toBe(true);
  });
});

describe("escapeCell", () => {
  it("keeps a table cell on one line and stops it breaking the table or injecting markup", () => {
    const out = escapeCell("a | b\nc\r\nd <script>alert(1)</script> `tick`");
    expect(out).toBe("a \\| b c d \\<script\\>alert(1)\\</script\\> 'tick'");
    expect(out).not.toMatch(/\n/);
  });
});

const siteResult = (host: string, report: Report | undefined, extra: Partial<SiteResult> = {}): SiteResult => ({
  url: `https://${host}/`,
  host,
  dir: host,
  seconds: 12.34,
  report,
  crashes: report ? crashesOf(report) : [],
  ...extra,
});

const reportWith = (findings: ReturnType<typeof finding>[], extra: Partial<Report> = {}): Report => makeReport({ findings, ...extra });

describe("reviewMarkdown", () => {
  const a = siteResult(
    "a.example",
    reportWith([
      finding("Low one", "low", "ev low", { checkId: "HYG-002" }),
      finding("Critical one", "critical", "ev critical", { checkId: "SEC-001" }),
      finding("High B", "high", "ev high b", { checkId: "SEO-001" }),
      finding("High A", "high", "ev high a", { checkId: "A11Y-001" }),
    ]),
  );
  const b = siteResult("b.example", reportWith([finding("Medium", "medium", "ev m", { checkId: "SEC-003" })]));
  const clean = siteResult("clean.example", reportWith([]));
  const failed = siteResult("down.example", undefined, { error: "page.goto: net::ERR_CONNECTION_REFUSED" });
  const md = reviewMarkdown([a, b, clean, failed], "2026-10-01T00:00:00.000Z");
  const rows = md.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Site"));

  it("has the six columns, with Verdict last and empty on every row", () => {
    expect(md).toContain("| Site | Check | Severity | Title | Evidence | Verdict |");
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(row).toMatch(/\|  \|$/);
  });

  it("explains how to fill it in", () => {
    expect(md).toContain("TP (true positive), FP (false positive) or unsure");
    expect(md).toContain("pnpm validate:tally");
  });

  it("has one row per finding, grouped by site in the order given", () => {
    expect(rows.map((r) => r.split(" | ")[0].replace("| ", ""))).toEqual(["a.example", "a.example", "a.example", "a.example", "b.example"]);
  });

  it("orders a site's rows by severity, then check id", () => {
    expect(rows.slice(0, 4).map((r) => r.split(" | ")[1])).toEqual(["SEC-001", "A11Y-001", "SEO-001", "HYG-002"]);
  });

  it("shows the severity, title and evidence", () => {
    expect(rows[0]).toBe("| a.example | SEC-001 | critical | Critical one | ev critical |  |");
  });

  it("lists clean and failed sites below the table", () => {
    expect(md).toContain("Scanned with no findings: clean.example");
    expect(md).toContain("Could not be scanned: down.example (page.goto: net::ERR_CONNECTION_REFUSED)");
  });

  it("says none when every site had findings and all were scanned", () => {
    const text = reviewMarkdown([a], "t");
    expect(text).toContain("Scanned with no findings: none");
    expect(text).toContain("Could not be scanned: none");
  });

  it("keeps hostile or huge evidence from breaking the table", () => {
    const evil = siteResult(
      "evil.example",
      reportWith([finding("T | with pipe", "low", `bad | pipe\nnew line <img src=x onerror=alert(1)> \`code\` ${"x".repeat(1000)}`, { checkId: "HYG-005" })]),
    );
    const row = reviewMarkdown([evil], "t").split("\n").find((l) => l.startsWith("| evil.example"))!;
    expect(row.split(/(?<!\\)\|/)).toHaveLength(8); // empty, six cells, empty after the last pipe
    expect(row).not.toMatch(/(?<!\\)</); // every < is escaped
    expect(row).not.toContain("`");
    expect(row.length).toBeLessThan(600);
    expect(row).toContain("...");
  });

  it("writes only a header, and no rows, when there are no findings at all", () => {
    expect(reviewMarkdown([clean], "t").split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Site"))).toEqual([]);
  });
});

describe("crashes and the summary", () => {
  const crashedReport = reportWith([finding("F", "low", "e", { checkId: "SEO-001" })], {
    notTested: [
      { checkId: "A11Y-001", title: "Accessibility", reason: "check failed: the accessibility scan failed: axe timed out" },
      { checkId: "PERF-001", title: "Performance", reason: "check failed: Lighthouse timed out after 60 s" },
      { checkId: "SEC-002", title: "Public source maps", reason: "5 source maps not checked (limit 20)" },
      { checkId: "SEC-006", title: "Database test", reason: "domain not verified" },
    ],
  });

  it("finds crashed checks by their 'check failed:' reason", () => {
    expect(crashesOf(crashedReport)).toEqual([
      { checkId: "A11Y-001", title: "Accessibility", message: "the accessibility scan failed: axe timed out" },
      { checkId: "PERF-001", title: "Performance", message: "Lighthouse timed out after 60 s" },
    ]);
    expect(crashesOf(reportWith([]))).toEqual([]);
  });

  const results = [
    siteResult("a.example", reportWith([finding("1", "critical", "e", { checkId: "SEC-001" }), finding("2", "low", "e", { checkId: "HYG-002" })]), { seconds: 30 }),
    siteResult("b.example", crashedReport, { seconds: 90 }),
    siteResult("c.example", reportWith([finding("3", "low", "e", { checkId: "HYG-002" }), finding("4", "low", "e", { checkId: "HYG-002" })]), { seconds: 10 }),
    siteResult("d.example", undefined, { error: "timeout", seconds: 60 }),
    siteResult("e.example", reportWith([]), { seconds: 5 }),
  ];
  const summary = summarize(results, 195);

  it("counts findings and sites per check id, biggest first", () => {
    expect(summary.byCheck).toEqual([
      { checkId: "HYG-002", findings: 3, sites: 2 },
      { checkId: "SEC-001", findings: 1, sites: 1 },
      { checkId: "SEO-001", findings: 1, sites: 1 },
    ]);
    expect(summary.findingsTotal).toBe(5);
    expect(summary.bySeverity).toEqual({ critical: 1, high: 0, medium: 0, low: 4 });
  });

  it("counts sites, failures, crashes and the total time", () => {
    expect(summary).toMatchObject({ sites: 5, scanned: 4, totalSeconds: 195 });
    expect(summary.failed.map((s) => s.host)).toEqual(["d.example"]);
    expect(summary.crashes).toEqual([
      { host: "b.example", checkId: "A11Y-001", message: "the accessibility scan failed: axe timed out" },
      { host: "b.example", checkId: "PERF-001", message: "Lighthouse timed out after 60 s" },
    ]);
  });

  it("names the three slowest sites, failed ones included", () => {
    expect(summary.slowest).toEqual([
      { host: "b.example", seconds: 90 },
      { host: "d.example", seconds: 60 },
      { host: "a.example", seconds: 30 },
    ]);
  });

  it("lists fewer than three when there are fewer sites", () => {
    expect(summarize([results[0]], 30).slowest).toEqual([{ host: "a.example", seconds: 30 }]);
    expect(summarize([], 0).slowest).toEqual([]);
  });

  it("tallies why things were not tested, counting crashes once under one heading", () => {
    expect(summary.notTestedReasons).toEqual([
      { reason: "check failed:", count: 2 },
      { reason: "5 source maps not checked (limit 20)", count: 1 },
      { reason: "domain not verified", count: 1 },
    ]);
  });

  it("writes a summary file with every section", () => {
    const md = summaryMarkdown(results, summary, "2026-10-01T00:00:00.000Z");
    for (const heading of ["## Per site", "## Findings per check", "## Crashed checks", "## Why things were not tested", "## Slowest sites", "## Sites that could not be scanned"]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("4 of 5 sites scanned in 195.0s. 5 findings.");
    expect(md).toContain("| b.example | 90.0s |");
    expect(md).toContain("could not be scanned: timeout");
    expect(md).toContain("- b.example: A11Y-001: the accessibility scan failed: axe timed out");
  });

  it("prints a terminal version too", () => {
    const text = summaryText(summary).join("\n");
    expect(text).toContain("Done: 4 of 5 sites scanned");
    expect(text).toContain("HYG-002");
    expect(text).toContain("Crashed checks (2):");
    expect(text).toContain("1. b.example 90.0s");
    expect(text).toContain("d.example: timeout");
  });

  it("says none for crashes when there are none", () => {
    expect(summaryText(summarize([results[0]], 1)).join("\n")).toContain("Crashed checks: none");
  });
});

describe("the gitignore guard", () => {
  const logs: string[] = [];
  const log = (l: string) => logs.push(l);

  it("passes when every path is ignored", async () => {
    await expect(ensureIgnored(["validation/review.md", "sites.local.txt"], async () => true, log)).resolves.toBeUndefined();
  });

  it("refuses, naming the paths, when one is not ignored", async () => {
    const isIgnored = async (file: string) => file !== "sites.txt";
    await expect(ensureIgnored(["validation/review.md", "sites.txt"], isIgnored, log)).rejects.toThrow(NotIgnoredError);
    await expect(ensureIgnored(["validation/review.md", "sites.txt"], isIgnored, log)).rejects.toThrow(/sites\.txt/);
    await expect(ensureIgnored(["validation/review.md", "sites.txt"], isIgnored, log)).rejects.toThrow(/sites\.local\.txt/);
  });

  it("carries on with a notice when git cannot say", async () => {
    logs.length = 0;
    await ensureIgnored(["x"], async () => undefined, log);
    expect(logs.join("\n")).toMatch(/could not ask git/);
  });
});

describe("runValidation (with a fake scanner)", () => {
  const fakeReports: Record<string, Report> = {};
  function setup(urls: string[], behaviour: (url: string) => Report | Error) {
    const calls: { url: string; outDir: string; options: ScanOptions }[] = [];
    const sleeps: number[] = [];
    const order: string[] = [];
    let clock = 0;
    const deps: Partial<ValidationDeps> = {
      scan: async (url, outDir, options) => {
        calls.push({ url, outDir, options });
        order.push(`start ${url}`);
        const result = behaviour(url);
        clock += 10_000;
        order.push(`end ${url}`);
        if (result instanceof Error) throw result;
        const reportPath = path.join(outDir, "launchscore-report.json");
        fakeReports[reportPath] = result;
        return { reportPath } as ScanSummary;
      },
      readReport: async (file) => fakeReports[file],
      sleep: async (ms) => void sleeps.push(ms),
      now: () => clock,
      log: () => undefined,
      isIgnored: async () => true,
    };
    return { calls, sleeps, order, deps, urls };
  }

  it("scans one site at a time, in order, with a pause between sites but not after the last", async () => {
    const dir = await tmp();
    const { calls, sleeps, order, deps, urls } = setup(["https://a.example/", "https://b.example/", "https://c.example/"], () => reportWith([]));
    await runValidation({ urls, outDir: dir, deps });
    expect(calls.map((c) => c.url)).toEqual(urls);
    expect(order).toEqual(urls.flatMap((u) => [`start ${u}`, `end ${u}`]));
    expect(sleeps).toEqual([2000, 2000]);
  });

  it("writes each site's files to its own folder inside the output folder", async () => {
    const dir = await tmp();
    const { calls, deps, urls } = setup(["https://a.example/", "https://a.example/other", "http://localhost:3000/"], () => reportWith([]));
    await runValidation({ urls, outDir: dir, deps });
    expect(calls.map((c) => path.relative(dir, c.outDir))).toEqual(["a.example", "a.example-2", "localhost_3000"]);
  });

  it("forces passive checks only: the scan is told nothing is ever verified, even for localhost", async () => {
    const dir = await tmp();
    const { calls, deps, urls } = setup(["http://127.0.0.1:3000/"], () => reportWith([]));
    await runValidation({ urls, outDir: dir, deps, scanOptions: { skipPerformance: true, verify: async () => true } });
    const options = calls[0].options;
    expect(await options.verify!("http://127.0.0.1:3000/")).toBe(false);
    expect(await options.verify!("https://anything.example/")).toBe(false);
    expect(options.skipPerformance).toBe(true); // a test-only override still passes through
  });

  it("leaves the speed test on unless a test turns it off", async () => {
    const dir = await tmp();
    const { calls, deps, urls } = setup(["https://a.example/"], () => reportWith([]));
    await runValidation({ urls, outDir: dir, deps });
    expect(calls[0].options.skipPerformance).toBeUndefined();
  });

  it("carries on after a site fails, and records why", async () => {
    const dir = await tmp();
    const { deps, urls } = setup(["https://a.example/", "https://down.example/", "https://c.example/"], (url) =>
      url.includes("down") ? new Error("Could not load https://down.example/: net::ERR_CONNECTION_REFUSED\n    at stack") : reportWith([finding("F", "low", "e", { checkId: "SEO-001" })]),
    );
    const run = await runValidation({ urls, outDir: dir, deps });
    expect(run.results.map((r) => r.host)).toEqual(["a.example", "down.example", "c.example"]);
    expect(run.results[1].error).toBe("Could not load https://down.example/: net::ERR_CONNECTION_REFUSED");
    expect(run.results[1].report).toBeUndefined();
    expect(run.summary).toMatchObject({ sites: 3, scanned: 2 });
    expect(await readFile(run.reviewPath, "utf8")).toContain("Could not be scanned: down.example");
  });

  it("logs a line per site with time, score, findings, crashes and not-tested counts", async () => {
    const dir = await tmp();
    const logs: string[] = [];
    const crashed = reportWith([finding("F", "high", "e", { checkId: "SEO-001" })], {
      notTested: [{ checkId: "PERF-001", title: "Performance", reason: "check failed: Lighthouse timed out after 60 s" }],
    });
    const { deps, urls } = setup(["https://a.example/"], () => crashed);
    await runValidation({ urls, outDir: dir, deps: { ...deps, log: (l) => logs.push(l) } });
    expect(logs[0]).toMatch(/^\[1\/1\] a\.example {2}10\.0s {2}score \d+ .+ {2}1 findings {2}1 crashes {2}1 not tested$/);
    expect(logs.join("\n")).toContain("crashed: PERF-001 Lighthouse timed out after 60 s");
  });

  it("writes review.md and summary.md, and nothing outside the output folder", async () => {
    const dir = await tmp();
    const { deps, urls } = setup(["https://a.example/"], () => reportWith([finding("T", "low", "ev", { checkId: "HYG-002" })]));
    const run = await runValidation({ urls, outDir: path.join(dir, "validation"), deps });
    expect(run.reviewPath).toBe(path.join(dir, "validation", "review.md"));
    expect(await readdir(dir)).toEqual(["validation"]);
    expect(await readFile(run.reviewPath, "utf8")).toContain("| a.example | HYG-002 | low | T | ev |  |");
    expect(await readFile(run.summaryPath, "utf8")).toContain("# launchscore validation summary");
  });

  describe("an existing review.md", () => {
    const findings = () => reportWith([finding("T", "low", "ev", { checkId: "HYG-002" })]);
    const row = (verdict: string) => `| a.example | HYG-002 | low | T | ev | ${verdict} |`;

    async function runOver(existing: string | undefined) {
      const dir = await tmp();
      const out = path.join(dir, "validation");
      const review = path.join(out, "review.md");
      if (existing !== undefined) {
        await mkdir(out, { recursive: true });
        await writeFile(review, existing, "utf8");
      }
      const { deps, urls } = setup(["https://a.example/"], findings);
      const run = await runValidation({ urls, outDir: out, deps });
      return { run, out, review };
    }

    it("is replaced when it has no verdicts (nothing to lose)", async () => {
      const { run, review } = await runOver(`# old\n\n| Site | Check | Severity | Title | Evidence | Verdict |\n|---|---|---|---|---|---|\n${row("")}\n`);
      expect(run.reviewPath).toBe(review);
      expect(run.keptReview).toBeUndefined();
      expect(await readFile(review, "utf8")).not.toContain("# old");
    });

    it("is created normally when there is none", async () => {
      const { run, review } = await runOver(undefined);
      expect(run.reviewPath).toBe(review);
      expect(run.keptReview).toBeUndefined();
    });

    it.each(["TP", "FP", "unsure", "maybe later"])("is never overwritten when a row says %j: the new table goes to review-<timestamp>.md", async (verdict) => {
      const marked = `# my review\n\n| Site | Check | Severity | Title | Evidence | Verdict |\n|---|---|---|---|---|---|\n${row("")}\n${row(verdict)}\n`;
      const { run, out, review } = await runOver(marked);
      expect(await readFile(review, "utf8")).toBe(marked); // byte for byte
      expect(run.keptReview).toBe(review);
      expect(path.dirname(run.reviewPath)).toBe(out);
      expect(path.basename(run.reviewPath)).toMatch(/^review-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.md$/);
      expect(await readFile(run.reviewPath, "utf8")).toContain("| a.example | HYG-002 | low | T | ev |  |");
      expect(await readdir(out)).toEqual(expect.arrayContaining(["review.md", path.basename(run.reviewPath), "summary.md"]));
    });

    it("keeps a file with a table line it cannot read as a row, rather than risk losing a verdict", async () => {
      const { run, review } = await runOver("I started reviewing but changed the layout\n| Site | Check | Severity | Title | Evidence | Verdict |\n|---|---|---|---|---|---|\n| a.example | HYG-002 | FP |\n");
      expect(run.keptReview).toBe(review);
      expect(run.reviewPath).not.toBe(review);
    });

    it("does not overwrite an earlier timestamped review either", async () => {
      const dir = await tmp();
      const out = path.join(dir, "validation");
      await mkdir(out, { recursive: true });
      await writeFile(path.join(out, "review.md"), `| Site | Check | Severity | Title | Evidence | Verdict |\n|---|---|---|---|---|---|\n${row("TP")}\n`, "utf8");
      const { deps, urls } = setup(["https://a.example/"], findings);
      const first = await runValidation({ urls, outDir: out, deps });
      const second = await runValidation({ urls, outDir: out, deps });
      expect(second.reviewPath).not.toBe(first.reviewPath);
      expect(existsSync(first.reviewPath)).toBe(true);
      expect(existsSync(second.reviewPath)).toBe(true);
    });
  });

  it("refuses to write anything when the output folder is not gitignored", async () => {
    const dir = await tmp();
    const { calls, deps, urls } = setup(["https://a.example/"], () => reportWith([]));
    await expect(runValidation({ urls, outDir: path.join(dir, "out"), deps: { ...deps, isIgnored: async () => false } })).rejects.toThrow(NotIgnoredError);
    expect(calls).toEqual([]); // nothing was scanned
    expect(existsSync(path.join(dir, "out"))).toBe(false); // nothing was created
  });

  it("also refuses when the list file is not gitignored", async () => {
    const dir = await tmp();
    const { calls, deps, urls } = setup(["https://a.example/"], () => reportWith([]));
    const isIgnored = async (file: string) => !file.endsWith("sites.txt");
    await expect(runValidation({ urls, outDir: path.join(dir, "out"), guardPaths: ["sites.txt"], deps: { ...deps, isIgnored } })).rejects.toThrow(/sites\.txt/);
    expect(calls).toEqual([]);
  });
});

describe("normalizeVerdict", () => {
  it.each([
    ["TP", "TP"], ["tp", "TP"], [" True positive ", "TP"], ["true", "TP"],
    ["FP", "FP"], ["fp", "FP"], ["False Positive", "FP"], ["false", "FP"],
    ["unsure", "unsure"], ["Unsure", "unsure"], ["?", "unsure"], ["u", "unsure"],
    ["", "unmarked"], ["   ", "unmarked"],
    ["maybe later", "unrecognised"], ["yes", "unrecognised"], ["TPP", "unrecognised"],
  ] as const)("%j is %s", (raw, expected) => {
    expect(normalizeVerdict(raw)).toBe(expected);
  });
});

describe("tally", () => {
  const filled = (verdicts: string[]): string => {
    const base = reviewMarkdown(
      [
        siteResult(
          "a.example",
          reportWith([
            finding("T1", "critical", "e1", { checkId: "SEC-001" }),
            finding("T2", "high", "e2 | with pipe", { checkId: "SEO-001" }),
            finding("T3", "low", "e3", { checkId: "SEO-001" }),
            finding("T4", "low", "e4", { checkId: "SEO-001" }),
            finding("T5", "low", "e5", { checkId: "HYG-002" }),
            finding("T6", "low", "e6", { checkId: "HYG-002" }),
          ]),
        ),
      ],
      "t",
    );
    let i = 0;
    return base
      .split("\n")
      .map((line) => (line.startsWith("| a.example") ? line.replace(/\|  \|$/, `| ${verdicts[i++] ?? ""} |`) : line))
      .join("\n");
  };

  it("parses the table the harness wrote, including escaped pipes in a cell", () => {
    const { rows, malformed } = parseReview(filled(["TP", "TP", "FP", "unsure", "", "TP"]));
    expect(malformed).toEqual([]);
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.check)).toEqual(["SEC-001", "SEO-001", "HYG-002", "HYG-002", "SEO-001", "SEO-001"]);
    expect(rows.find((r) => r.title === "T2")!.evidence).toBe("e2 | with pipe");
  });

  it("counts TP, FP, unsure and unmarked per check id, and gives precision as TP / (TP + FP)", () => {
    // rows are ordered by severity then check: SEC-001 T1, SEO-001 T2, HYG-002 T5, HYG-002 T6, SEO-001 T3, SEO-001 T4
    const t = tally(filled(["TP", "TP", "FP", "TP", "FP", "unsure"]));
    expect(t.perCheck).toEqual([
      { checkId: "HYG-002", TP: 1, FP: 1, unsure: 0, unmarked: 0, unrecognised: 0, precision: 0.5 },
      { checkId: "SEC-001", TP: 1, FP: 0, unsure: 0, unmarked: 0, unrecognised: 0, precision: 1 },
      { checkId: "SEO-001", TP: 1, FP: 1, unsure: 1, unmarked: 0, unrecognised: 0, precision: 0.5 },
    ]);
    expect(t.overall).toMatchObject({ checkId: "Overall", TP: 3, FP: 2, unsure: 1, unmarked: 0, precision: 3 / 5 });
  });

  it("leaves unsure and unmarked rows out of precision, and says n/a when nothing is decided", () => {
    const t = tally(filled(["unsure", "", "", "", "", ""]));
    expect(t.overall.precision).toBeUndefined();
    expect(t.overall).toMatchObject({ unsure: 1, unmarked: 5 });
    expect(tallyText(t)).toContain("n/a");
  });

  it("lists the false positives with their site, check and title", () => {
    const t = tally(filled(["TP", "FP", "", "", "", ""]));
    expect(t.falsePositives).toHaveLength(1);
    const md = tallyMarkdown(t, "t");
    expect(md).toContain("## False positives to fix");
    expect(md).toContain("- a.example: SEO-001: T2 (e2 \\| with pipe)");
  });

  it("says so when no false positive is marked", () => {
    expect(tallyMarkdown(tally(filled(["TP", "TP", "TP", "TP", "TP", "TP"])), "t")).toContain("None marked.");
  });

  it("flags verdicts it does not recognise instead of ignoring them", () => {
    const t = tally(filled(["TP", "yes", "", "", "", ""]));
    expect(t.overall.unrecognised).toBe(1);
    expect(t.unrecognised[0].rawVerdict).toBe("yes");
    expect(tallyMarkdown(t, "t")).toContain("Verdicts that were not recognised");
  });

  it("formats the percentages and the terminal table", () => {
    const text = tallyText(tally(filled(["TP", "TP", "FP", "TP", "FP", "unsure"])));
    expect(text).toContain("Check");
    expect(text).toMatch(/SEC-001\s+1\s+0\s+0\s+0\s+100\.0%/);
    expect(text).toMatch(/Overall\s+3\s+2\s+1\s+0\s+60\.0%/);
  });

  it("reports rows it cannot read, without stopping", () => {
    const md = "| Site | Check | Severity | Title | Evidence | Verdict |\n|---|---|---|---|---|---|\n| a | SEC-001 | low |\n| a | SEC-001 | low | t | e | TP |\n";
    const t = tally(md);
    expect(t.malformed).toEqual([3]);
    expect(t.overall.TP).toBe(1);
  });

  it("copes with a review file that has no rows", () => {
    const t = tally("# nothing here\n");
    expect(t.perCheck).toEqual([]);
    expect(t.overall.precision).toBeUndefined();
  });
});
