import { runScan, type RunOptions } from "./runner.js";
import { buildReport, writeJsonReport } from "./report/json.js";
import { renderCardImages, writeCardImages } from "./report/card.js";
import { renderHtmlReport, writeHtmlReport } from "./report/html.js";
import { VERSION } from "./version.js";
import type { Verdict } from "./score.js";

export interface ScanSummary {
  reportPath: string;
  htmlPath: string;
  cardPaths: string[];
  cardError?: string;
  checksRun: number;
  findings: number;
  detected: number;
  notTested: number;
  score: number | null;
  verdict: Verdict;
  partial: boolean;
  untestedCategories: string[];
}

export interface ScanOptions extends RunOptions {
  writeCards?: boolean; // default true
}

// http for localhost, https for everything else, so `launchscore mysite.com` just works.
export function normalizeUrl(input: string): string {
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
  const withScheme = hasScheme
    ? input
    : `${/^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(input) ? "http" : "https"}://${input}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error(`"${input}" does not look like a web address. Try something like https://mysite.com`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https addresses can be scanned.");
  }
  return parsed.href;
}

export async function scanAndWrite(input: string, outDir: string, options: ScanOptions = {}): Promise<ScanSummary> {
  const { writeCards = true, ...runOptions } = options;
  const result = await runScan(normalizeUrl(input), runOptions);
  const report = buildReport(result);
  // The JSON report is written first: a card problem must never lose it.
  const reportPath = await writeJsonReport(report, outDir);

  let cardPaths: string[] = [];
  let cardPng: Buffer | undefined;
  let cardError: string | undefined;
  if (writeCards) {
    try {
      const images = await renderCardImages(report);
      cardPaths = await writeCardImages(images, outDir);
      cardPng = images.landscape;
    } catch (err) {
      cardError = err instanceof Error ? err.message.split("\n")[0] : String(err);
    }
  }

  // The web page embeds the landscape card when there is one, and is written either way.
  const htmlPath = await writeHtmlReport(renderHtmlReport(report, { cardPng, version: VERSION }), outDir);

  return {
    reportPath,
    htmlPath,
    cardPaths,
    cardError,
    checksRun: result.checksRun,
    findings: result.findings.length,
    detected: result.detected.length,
    notTested: result.notTested.length,
    score: report.score,
    verdict: report.verdict,
    partial: report.partial,
    untestedCategories: report.categories.filter((c) => !c.tested).map((c) => c.name),
  };
}
