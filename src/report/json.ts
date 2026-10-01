import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ScanResult } from "../runner.js";
import type { Detection, Finding, NotTested } from "../types.js";

export const REPORT_FILENAME = "launchscore-report.json";

export const FindingSchema: z.ZodType<Finding> = z.object({
  checkId: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]),
  title: z.string().min(1),
  why: z.string().min(1),
  evidence: z.string(),
  fix: z.string().min(1),
});

export const DetectionSchema: z.ZodType<Detection> = z.object({
  checkId: z.string().min(1),
  stack: z.string().min(1),
  url: z.string().optional(),
  note: z.string().min(1),
});

export const NotTestedSchema: z.ZodType<NotTested> = z.object({
  checkId: z.string().min(1),
  title: z.string().min(1),
  reason: z.string().min(1),
});

const CategoryScoreSchema = z
  .object({
    name: z.enum(["security", "seo", "accessibility", "performance", "hygiene"]),
    score: z.number().int().min(0).max(100).nullable(),
    tested: z.boolean(),
  })
  .refine((c) => c.tested === (c.score !== null), { message: "tested must be true exactly when score is set" });

export const ReportSchema = z.object({
  url: z.string().url(),
  scannedAt: z.string().datetime(),
  findings: z.array(FindingSchema),
  detected: z.array(DetectionSchema),
  notTested: z.array(NotTestedSchema),
  score: z.number().int().min(0).max(100).nullable(), // null only when nothing was tested
  verdict: z.enum(["READY TO LAUNCH", "ALMOST READY", "NEEDS WORK", "BLOCKED: CRITICAL ISSUE", "NOT SCORED"]),
  categories: z.array(CategoryScoreSchema).length(5),
  partial: z.boolean(), // an untested category, a skipped script, or a crashed check
  verified: z.boolean(), // active checks ran (the domain is verified)
});

export type Report = z.infer<typeof ReportSchema>;

// Picks only the report fields, so runner-only data (checksRun) and page context never reach disk.
export function buildReport(result: ScanResult): Report {
  return ReportSchema.parse({
    url: result.url,
    scannedAt: result.scannedAt,
    findings: result.findings,
    detected: result.detected,
    notTested: result.notTested,
    score: result.score.score,
    verdict: result.score.verdict,
    categories: result.score.categories,
    partial: result.score.partial,
    verified: result.verified,
  });
}

// Validates first: an invalid report writes nothing.
export async function writeJsonReport(report: Report, dir: string): Promise<string> {
  const valid = ReportSchema.parse(report);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, REPORT_FILENAME);
  await writeFile(file, JSON.stringify(valid, null, 2) + "\n", "utf8");
  return file;
}
