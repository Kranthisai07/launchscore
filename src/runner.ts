import { buildContext, type ContextOptions, type PageContext } from "./context.js";
import { checks as registry } from "./checks/index.js";
import { isVerified } from "./verify.js";
import { computeScore, type ScoreResult } from "./score.js";
import type { Check, Detection, Finding, NotTested } from "./types.js";

export const MAX_CONCURRENT_CHECKS = 5;

export interface RunOptions {
  checks?: Check[];
  verify?: (url: string) => Promise<boolean>;
  context?: ContextOptions;
}

export interface ScanResult {
  url: string; // final URL after redirects
  scannedAt: string;
  findings: Finding[];
  detected: Detection[];
  notTested: NotTested[];
  checksRun: number;
  score: ScoreResult;
  verified: boolean; // at least one active check ran
}

// Runs fn over items with at most `limit` in flight. Results keep input order.
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

interface CheckOutcome {
  check: Check;
  findings: Finding[];
  detected: Detection[];
  notTested?: NotTested;
}

async function runCheck(check: Check, ctx: PageContext): Promise<CheckOutcome> {
  try {
    const findings = await check.run(ctx);
    const detected = check.detect ? await check.detect(ctx) : [];
    return { check, findings, detected };
  } catch (err) {
    // A crashed check is never reported as passed or as a finding: false positives are worse than misses.
    const message = err instanceof Error ? err.message.split("\n")[0].slice(0, 200) : "unknown error";
    return {
      check,
      findings: [],
      detected: [],
      notTested: { checkId: check.id, title: check.title, reason: `check failed: ${message}` },
    };
  }
}

export async function runScan(url: string, options: RunOptions = {}): Promise<ScanResult> {
  const { checks = registry, verify = isVerified, context } = options;
  const ctx = await buildContext(url, context);

  const notTested: NotTested[] = [];
  const toRun: Check[] = [];

  const redirectedAway = new URL(ctx.finalUrl).hostname !== new URL(url).hostname;
  const verified = redirectedAway ? false : await verify(ctx.finalUrl);

  for (const check of checks) {
    if (check.mode === "passive" || verified) {
      toRun.push(check);
    } else {
      notTested.push({
        checkId: check.id,
        title: check.title,
        reason: redirectedAway ? "redirected to a different domain" : "domain not verified",
      });
    }
  }

  const outcomes = await mapWithLimit(toRun, MAX_CONCURRENT_CHECKS, (check) => runCheck(check, ctx));

  if (ctx.skippedScripts.length > 0) {
    notTested.push({
      checkId: "CONTEXT",
      title: "JavaScript files not scanned",
      reason: `scripts not scanned: ${ctx.skippedScripts.length} file(s)`,
    });
  }

  // Only checks that completed count: a crashed check or an unverified active check tests nothing.
  const completed = outcomes.filter((o) => !o.notTested);
  const score = computeScore({
    findings: completed.flatMap((o) => o.findings.map((f) => ({ category: o.check.category, severity: f.severity }))),
    testedCategories: completed.map((o) => o.check.category),
    incomplete: outcomes.some((o) => o.notTested) || ctx.skippedScripts.length > 0,
  });

  return {
    url: ctx.finalUrl,
    scannedAt: new Date().toISOString(),
    findings: outcomes.flatMap((o) => o.findings),
    detected: outcomes.flatMap((o) => o.detected),
    notTested: [...notTested, ...outcomes.flatMap((o) => (o.notTested ? [o.notTested] : []))],
    checksRun: toRun.length,
    score,
    verified: completed.some((o) => o.check.mode === "active"),
  };
}
