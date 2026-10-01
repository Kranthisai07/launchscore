import { runScan, type RunOptions } from "./runner.js";
import { buildReport, writeJsonReport } from "./report/json.js";

export interface ScanSummary {
  reportPath: string;
  checksRun: number;
  findings: number;
  detected: number;
  notTested: number;
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

export async function scanAndWrite(input: string, outDir: string, options?: RunOptions): Promise<ScanSummary> {
  const result = await runScan(normalizeUrl(input), options);
  const reportPath = await writeJsonReport(buildReport(result), outDir);
  return {
    reportPath,
    checksRun: result.checksRun,
    findings: result.findings.length,
    detected: result.detected.length,
    notTested: result.notTested.length,
  };
}
