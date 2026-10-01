// Real-site validation harness: scan a list of sites one by one, collect every finding into a review
// table to mark up (TP / FP / unsure), and summarise the run. Plain functions so it is easy to test.
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ReportSchema, type Report } from "../src/report/json.js";
import { normalizeUrl, scanAndWrite, type ScanOptions, type ScanSummary } from "../src/scan.js";

// ---------------------------------------------------------------------------------------------
// The list of sites

export interface ParsedSites {
  urls: string[]; // normalized, in order, duplicates dropped
  errors: { line: number; text: string; message: string }[];
}

export function parseSiteList(text: string): ParsedSites {
  const urls: string[] = [];
  const errors: ParsedSites["errors"] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    try {
      const url = normalizeUrl(line);
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    } catch (err) {
      errors.push({ line: index + 1, text: line, message: err instanceof Error ? err.message : String(err) });
    }
  });
  return { urls, errors };
}

// A folder name for a site: the host, with a port as _3000, unsafe characters as _, and -2, -3 for a repeat.
export function siteDirName(url: string, used: Set<string>): string {
  const parsed = new URL(url);
  let name = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (parsed.port) name += `_${parsed.port}`;
  name = name.replace(/[^a-z0-9._-]/g, "_").replace(/^\.+/, "_") || "site";
  let candidate = name;
  for (let n = 2; used.has(candidate); n++) candidate = `${name}-${n}`;
  used.add(candidate);
  return candidate;
}

// ---------------------------------------------------------------------------------------------
// Results

export interface Crash {
  checkId: string;
  title: string;
  message: string;
}

export interface SiteResult {
  url: string;
  host: string;
  dir: string;
  seconds: number;
  report?: Report;
  error?: string; // the scan itself failed
  crashes: Crash[];
}

const CRASH_PREFIX = "check failed:";

export function crashesOf(report: Report): Crash[] {
  return report.notTested
    .filter((n) => n.reason.startsWith(CRASH_PREFIX))
    .map((n) => ({ checkId: n.checkId, title: n.title, message: n.reason.slice(CRASH_PREFIX.length).trim() }));
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// ---------------------------------------------------------------------------------------------
// review.md

// Evidence can contain text from the site that was scanned, so a cell must not be able to break the table
// or inject markup.
export function escapeCell(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\|/g, "\\|")
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>")
    .replace(/`/g, "'");
}

const MAX_EVIDENCE = 300;

export function reviewMarkdown(results: SiteResult[], generatedAt: string): string {
  const rows: string[] = [];
  for (const site of results) {
    if (!site.report) continue;
    const ordered = site.report.findings
      .map((f, index) => ({ f, index }))
      .sort((a, b) => SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity] || a.f.checkId.localeCompare(b.f.checkId) || a.index - b.index);
    for (const { f } of ordered) {
      const evidence = f.evidence.length > MAX_EVIDENCE ? `${f.evidence.slice(0, MAX_EVIDENCE)}...` : f.evidence;
      rows.push(`| ${escapeCell(site.host)} | ${escapeCell(f.checkId)} | ${f.severity} | ${escapeCell(f.title)} | ${escapeCell(evidence)} |  |`);
    }
  }
  const clean = results.filter((s) => s.report && s.report.findings.length === 0).map((s) => s.host);
  const failed = results.filter((s) => s.error).map((s) => `${s.host} (${s.error})`);

  return [
    "# launchscore validation review",
    "",
    `Generated ${generatedAt}. Fill the Verdict column for each row with TP (true positive), FP (false positive) or unsure, then run \`pnpm validate:tally\`.`,
    "",
    "| Site | Check | Severity | Title | Evidence | Verdict |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
    `Scanned with no findings: ${clean.length ? clean.map(escapeCell).join(", ") : "none"}`,
    "",
    `Could not be scanned: ${failed.length ? failed.map(escapeCell).join("; ") : "none"}`,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------
// The summary

export interface Summary {
  sites: number;
  scanned: number;
  failed: SiteResult[];
  findingsTotal: number;
  byCheck: { checkId: string; findings: number; sites: number }[];
  bySeverity: Record<string, number>;
  crashes: { host: string; checkId: string; message: string }[];
  notTestedReasons: { reason: string; count: number }[];
  slowest: { host: string; seconds: number }[];
  totalSeconds: number;
}

export function summarize(results: SiteResult[], totalSeconds: number): Summary {
  const byCheck = new Map<string, { findings: number; sites: Set<string> }>();
  const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const reasons = new Map<string, number>();
  const crashes: Summary["crashes"] = [];
  let findingsTotal = 0;

  for (const site of results) {
    for (const c of site.crashes) crashes.push({ host: site.host, checkId: c.checkId, message: c.message });
    if (!site.report) continue;
    for (const f of site.report.findings) {
      findingsTotal++;
      bySeverity[f.severity]++;
      const entry = byCheck.get(f.checkId) ?? { findings: 0, sites: new Set<string>() };
      entry.findings++;
      entry.sites.add(site.host);
      byCheck.set(f.checkId, entry);
    }
    for (const n of site.report.notTested) {
      const reason = n.reason.startsWith(CRASH_PREFIX) ? CRASH_PREFIX.trim() : n.reason; // crashes are listed on their own
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
  }

  return {
    sites: results.length,
    scanned: results.filter((s) => s.report).length,
    failed: results.filter((s) => s.error),
    findingsTotal,
    byCheck: [...byCheck.entries()]
      .map(([checkId, v]) => ({ checkId, findings: v.findings, sites: v.sites.size }))
      .sort((a, b) => b.findings - a.findings || a.checkId.localeCompare(b.checkId)),
    bySeverity,
    crashes,
    notTestedReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    slowest: [...results].sort((a, b) => b.seconds - a.seconds).slice(0, 3).map((s) => ({ host: s.host, seconds: s.seconds })),
    totalSeconds,
  };
}

const secs = (n: number): string => `${n.toFixed(1)}s`;

export function siteLine(site: SiteResult, index: number, total: number): string {
  const head = `[${index}/${total}] ${site.host}`;
  if (!site.report) return `${head}  ${secs(site.seconds)}  COULD NOT BE SCANNED: ${site.error}`;
  const r = site.report;
  const score = r.score === null ? "not scored" : `score ${r.score} ${r.verdict}`;
  return `${head}  ${secs(site.seconds)}  ${score}  ${r.findings.length} findings  ${site.crashes.length} crashes  ${r.notTested.length} not tested`;
}

export function summaryMarkdown(results: SiteResult[], summary: Summary, generatedAt: string): string {
  const lines: string[] = [
    "# launchscore validation summary",
    "",
    `Generated ${generatedAt}. ${summary.scanned} of ${summary.sites} sites scanned in ${secs(summary.totalSeconds)}. ${summary.findingsTotal} findings.`,
    "",
    "## Per site",
    "",
    "| Site | Time | Score | Verdict | Findings | Crashed checks | Not tested |",
    "|---|---|---|---|---|---|---|",
    ...results.map((s) =>
      s.report
        ? `| ${escapeCell(s.host)} | ${secs(s.seconds)} | ${s.report.score ?? "n/a"} | ${escapeCell(s.report.verdict)} | ${s.report.findings.length} | ${s.crashes.length} | ${s.report.notTested.length} |`
        : `| ${escapeCell(s.host)} | ${secs(s.seconds)} | n/a | could not be scanned: ${escapeCell(s.error ?? "")} | 0 | 0 | 0 |`,
    ),
    "",
    "## Findings per check",
    "",
    "| Check | Findings | Sites |",
    "|---|---|---|",
    ...(summary.byCheck.length ? summary.byCheck.map((c) => `| ${c.checkId} | ${c.findings} | ${c.sites} |`) : ["| none | 0 | 0 |"]),
    "",
    `By severity: ${["critical", "high", "medium", "low"].map((s) => `${s} ${summary.bySeverity[s]}`).join(", ")}`,
    "",
    "## Crashed checks",
    "",
    ...(summary.crashes.length ? summary.crashes.map((c) => `- ${escapeCell(c.host)}: ${c.checkId}: ${escapeCell(c.message)}`) : ["None."]),
    "",
    "## Why things were not tested",
    "",
    ...(summary.notTestedReasons.length ? summary.notTestedReasons.map((n) => `- ${escapeCell(n.reason)}: ${n.count}`) : ["Nothing."]),
    "",
    "## Slowest sites",
    "",
    ...(summary.slowest.length ? summary.slowest.map((s, i) => `${i + 1}. ${escapeCell(s.host)}: ${secs(s.seconds)}`) : ["None."]),
    "",
    "## Sites that could not be scanned",
    "",
    ...(summary.failed.length ? summary.failed.map((s) => `- ${escapeCell(s.host)}: ${escapeCell(s.error ?? "")}`) : ["None."]),
    "",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// Keeping real-site data out of git

export class NotIgnoredError extends Error {
  constructor(public readonly paths: string[]) {
    super(
      `These paths are not gitignored, so real-site data could be committed: ${paths.join(", ")}. ` +
        "Name the list sites.local.txt (any *.local.txt) and keep output in validation/.",
    );
    this.name = "NotIgnoredError";
  }
}

// true: ignored. false: not ignored. undefined: git cannot tell (not a repository, or no git).
export type IsIgnored = (file: string) => Promise<boolean | undefined>;

export const gitIsIgnored: IsIgnored = async (file) => {
  const result = spawnSync("git", ["check-ignore", "-q", "--", file], { stdio: "ignore" });
  if (result.error) return undefined;
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  return undefined;
};

export async function ensureIgnored(files: string[], isIgnored: IsIgnored, log: (line: string) => void): Promise<void> {
  const notIgnored: string[] = [];
  let unknown = false;
  for (const file of files) {
    const answer = await isIgnored(file);
    if (answer === false) notIgnored.push(file);
    if (answer === undefined) unknown = true;
  }
  if (notIgnored.length) throw new NotIgnoredError(notIgnored);
  if (unknown) log("Note: could not ask git whether these paths are ignored (not a repository, or no git). Make sure nothing here is committed.");
}

// ---------------------------------------------------------------------------------------------
// The run

export interface ValidationDeps {
  scan: (url: string, outDir: string, options: ScanOptions) => Promise<ScanSummary>;
  readReport: (file: string) => Promise<Report>;
  sleep: (ms: number) => Promise<void>;
  now: () => number; // milliseconds
  log: (line: string) => void;
  isIgnored: IsIgnored;
}

export const defaultDeps: ValidationDeps = {
  scan: scanAndWrite,
  readReport: async (file) => ReportSchema.parse(JSON.parse(await readFile(file, "utf8"))),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => performance.now(),
  log: (line) => console.log(line),
  isIgnored: gitIsIgnored,
};

export interface ValidationOptions {
  urls: string[];
  outDir: string;
  guardPaths?: string[]; // extra paths that must be gitignored, such as the list file
  delayMs?: number; // pause between sites
  scanOptions?: ScanOptions; // for tests only (for example skipping Lighthouse); the real run passes none
  deps?: Partial<ValidationDeps>;
}

export interface ValidationRun {
  results: SiteResult[];
  summary: Summary;
  reviewPath: string;
  summaryPath: string;
}

export async function runValidation(options: ValidationOptions): Promise<ValidationRun> {
  const deps = { ...defaultDeps, ...options.deps };
  const { urls, outDir, delayMs = 2000 } = options;

  // Before anything is written: real-site data must never be committable.
  await ensureIgnored([path.join(outDir, "review.md"), ...(options.guardPaths ?? [])], deps.isIgnored, deps.log);
  await mkdir(outDir, { recursive: true });

  const used = new Set<string>();
  const results: SiteResult[] = [];
  const started = deps.now();

  for (const [i, url] of urls.entries()) {
    const dir = siteDirName(url, used);
    const t0 = deps.now();
    let report: Report | undefined;
    let error: string | undefined;
    try {
      // Passive checks only, whatever the address: active checks are never verified here.
      const summary = await deps.scan(url, path.join(outDir, dir), {
        ...options.scanOptions,
        verify: async () => false,
        onStatus: () => undefined,
      });
      report = await deps.readReport(summary.reportPath);
    } catch (err) {
      error = (err instanceof Error ? err.message : String(err)).split("\n")[0];
    }
    const site: SiteResult = {
      url,
      host: new URL(url).host,
      dir,
      seconds: (deps.now() - t0) / 1000,
      report,
      error,
      crashes: report ? crashesOf(report) : [],
    };
    results.push(site);
    deps.log(siteLine(site, i + 1, urls.length));
    for (const c of site.crashes) deps.log(`    crashed: ${c.checkId} ${c.message}`);
    for (const n of report?.notTested ?? []) if (!n.reason.startsWith(CRASH_PREFIX)) deps.log(`    not tested: ${n.checkId} ${n.reason}`);
    if (i < urls.length - 1 && delayMs > 0) await deps.sleep(delayMs);
  }

  const summary = summarize(results, (deps.now() - started) / 1000);
  const generatedAt = new Date().toISOString();
  const reviewPath = path.join(outDir, "review.md");
  const summaryPath = path.join(outDir, "summary.md");
  await writeFile(reviewPath, reviewMarkdown(results, generatedAt), "utf8");
  await writeFile(summaryPath, summaryMarkdown(results, summary, generatedAt), "utf8");
  return { results, summary, reviewPath, summaryPath };
}

// ---------------------------------------------------------------------------------------------
// The tally of your verdicts

export type Verdict = "TP" | "FP" | "unsure" | "unmarked" | "unrecognised";

export interface ReviewRow {
  site: string;
  check: string;
  severity: string;
  title: string;
  evidence: string;
  verdict: Verdict;
  rawVerdict: string;
}

export function normalizeVerdict(raw: string): Verdict {
  const v = raw.trim().toLowerCase();
  if (v === "") return "unmarked";
  if (["tp", "true", "true positive", "true-positive"].includes(v)) return "TP";
  if (["fp", "false", "false positive", "false-positive"].includes(v)) return "FP";
  if (["unsure", "?", "unknown", "u", "maybe"].includes(v)) return "unsure";
  return "unrecognised";
}

// Splits a table row on pipes that are not escaped (\|), then restores the escaped ones.
const splitRow = (line: string): string[] =>
  line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());

export function parseReview(markdown: string): { rows: ReviewRow[]; malformed: number[] } {
  const rows: ReviewRow[] = [];
  const malformed: number[] = [];
  let seenHeader = false;
  markdown.split(/\r?\n/).forEach((line, index) => {
    if (!line.trimStart().startsWith("|")) return;
    if (!seenHeader) {
      seenHeader = true; // the header row
      return;
    }
    if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) return; // the |---|---| line
    const cells = splitRow(line);
    if (cells.length < 6) {
      malformed.push(index + 1);
      return;
    }
    const [site, check, severity, title, evidence, verdict] = cells;
    rows.push({ site, check, severity, title, evidence, verdict: normalizeVerdict(verdict), rawVerdict: verdict });
  });
  return { rows, malformed };
}

export interface Counts {
  TP: number;
  FP: number;
  unsure: number;
  unmarked: number;
  unrecognised: number;
}

export interface TallyRow extends Counts {
  checkId: string;
  precision: number | undefined; // TP / (TP + FP); unsure and unmarked rows do not count
}

const emptyCounts = (): Counts => ({ TP: 0, FP: 0, unsure: 0, unmarked: 0, unrecognised: 0 });
const precisionOf = (c: Counts): number | undefined => (c.TP + c.FP === 0 ? undefined : c.TP / (c.TP + c.FP));

export interface Tally {
  perCheck: TallyRow[];
  overall: TallyRow;
  falsePositives: ReviewRow[];
  unrecognised: ReviewRow[];
  malformed: number[];
}

export function tally(markdown: string): Tally {
  const { rows, malformed } = parseReview(markdown);
  const per = new Map<string, Counts>();
  const overall = emptyCounts();
  for (const row of rows) {
    const counts = per.get(row.check) ?? emptyCounts();
    counts[row.verdict]++;
    overall[row.verdict]++;
    per.set(row.check, counts);
  }
  return {
    perCheck: [...per.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([checkId, c]) => ({ checkId, ...c, precision: precisionOf(c) })),
    overall: { checkId: "Overall", ...overall, precision: precisionOf(overall) },
    falsePositives: rows.filter((r) => r.verdict === "FP"),
    unrecognised: rows.filter((r) => r.verdict === "unrecognised"),
    malformed,
  };
}

export const percent = (p: number | undefined): string => (p === undefined ? "n/a" : `${(p * 100).toFixed(1)}%`);

export function tallyMarkdown(t: Tally, generatedAt: string): string {
  const row = (r: TallyRow) => `| ${r.checkId} | ${r.TP} | ${r.FP} | ${r.unsure} | ${r.unmarked} | ${percent(r.precision)} |`;
  return [
    "# launchscore validation tally",
    "",
    `Generated ${generatedAt}. Precision is TP / (TP + FP); rows marked unsure or not yet marked are left out of it.`,
    "",
    "| Check | TP | FP | unsure | unmarked | Precision |",
    "|---|---|---|---|---|---|",
    ...t.perCheck.map(row),
    row(t.overall),
    "",
    "## False positives to fix",
    "",
    ...(t.falsePositives.length
      ? t.falsePositives.map((r) => `- ${escapeCell(r.site)}: ${escapeCell(r.check)}: ${escapeCell(r.title)} (${escapeCell(r.evidence)})`)
      : ["None marked."]),
    "",
    ...(t.unrecognised.length
      ? [
          "## Verdicts that were not recognised (use TP, FP or unsure)",
          "",
          ...t.unrecognised.map((r) => `- ${escapeCell(r.site)}: ${escapeCell(r.check)}: "${escapeCell(r.rawVerdict)}"`),
          "",
        ]
      : []),
    ...(t.malformed.length ? [`Rows that could not be read (line numbers): ${t.malformed.join(", ")}`, ""] : []),
  ].join("\n");
}

export function tallyText(t: Tally): string {
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  const line = (r: TallyRow) => `${pad(r.checkId, 10)}${pad(r.TP, 5)}${pad(r.FP, 5)}${pad(r.unsure, 8)}${pad(r.unmarked, 10)}${percent(r.precision)}`;
  return [`${pad("Check", 10)}${pad("TP", 5)}${pad("FP", 5)}${pad("unsure", 8)}${pad("unmarked", 10)}Precision`, ...t.perCheck.map(line), line(t.overall)].join("\n");
}

// A compact version of the summary for the terminal.
export function summaryText(summary: Summary): string[] {
  return [
    "",
    `Done: ${summary.scanned} of ${summary.sites} sites scanned in ${secs(summary.totalSeconds)}, ${summary.findingsTotal} findings.`,
    "",
    "Findings per check (findings / sites):",
    ...(summary.byCheck.length ? summary.byCheck.map((c) => `  ${c.checkId.padEnd(9)} ${String(c.findings).padStart(3)} / ${c.sites}`) : ["  none"]),
    `By severity: ${["critical", "high", "medium", "low"].map((s) => `${s} ${summary.bySeverity[s]}`).join(", ")}`,
    "",
    summary.crashes.length ? `Crashed checks (${summary.crashes.length}):` : "Crashed checks: none",
    ...summary.crashes.map((c) => `  ${c.host}: ${c.checkId} ${c.message}`),
    "",
    "Slowest sites:",
    ...(summary.slowest.length ? summary.slowest.map((s, i) => `  ${i + 1}. ${s.host} ${secs(s.seconds)}`) : ["  none"]),
    ...(summary.failed.length ? ["", "Could not be scanned:", ...summary.failed.map((s) => `  ${s.host}: ${s.error}`)] : []),
  ];
}
