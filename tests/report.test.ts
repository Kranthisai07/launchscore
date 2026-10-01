import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildReport, REPORT_FILENAME, ReportSchema, writeJsonReport, type Report } from "../src/report/json.js";
import { computeScore } from "../src/score.js";
import type { ScanResult } from "../src/runner.js";

const validReport: Report = {
  url: "http://127.0.0.1:3000/",
  scannedAt: "2026-10-01T00:00:00.000Z",
  findings: [
    {
      checkId: "TEST-001",
      severity: "low",
      title: "A test finding",
      why: "It proves the schema works.",
      evidence: "abcd…wxyz",
      fix: "Nothing to do.",
    },
  ],
  detected: [{ checkId: "SEC-005", stack: "supabase", url: "https://fakeproject.supabase.co", note: "Detected." }],
  notTested: [{ checkId: "SEC-006", title: "Database test", reason: "domain not verified" }],
  score: 95,
  verdict: "ALMOST READY",
  categories: [
    { name: "security", score: 95, tested: true },
    { name: "seo", score: null, tested: false },
    { name: "accessibility", score: null, tested: false },
    { name: "performance", score: null, tested: false },
    { name: "hygiene", score: null, tested: false },
  ],
  partial: true,
  verified: false,
};

const tmpDirs: string[] = [];
const tmp = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "launchscore-"));
  tmpDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("ReportSchema", () => {
  it("accepts a valid report and an empty one", () => {
    expect(ReportSchema.safeParse(validReport).success).toBe(true);
    expect(ReportSchema.safeParse({ ...validReport, findings: [], detected: [], notTested: [] }).success).toBe(true);
  });

  it("accepts a not-scored report (score null, nothing tested)", () => {
    const categories = validReport.categories.map((c) => ({ ...c, score: null, tested: false }));
    expect(ReportSchema.safeParse({ ...validReport, score: null, verdict: "NOT SCORED", categories }).success).toBe(true);
  });

  it.each([
    ["missing findings", { ...validReport, findings: undefined }],
    ["unknown severity", { ...validReport, findings: [{ ...validReport.findings[0], severity: "urgent" }] }],
    ["bad date", { ...validReport, scannedAt: "yesterday" }],
    ["bad url", { ...validReport, url: "not a url" }],
    ["detection without stack", { ...validReport, detected: [{ checkId: "SEC-005", note: "x" }] }],
    ["missing score", { ...validReport, score: undefined }],
    ["score above 100", { ...validReport, score: 101 }],
    ["fractional score", { ...validReport, score: 50.5 }],
    ["old verdict wording", { ...validReport, verdict: "NOT READY" }],
    ["missing partial", { ...validReport, partial: undefined }],
    ["missing verified", { ...validReport, verified: undefined }],
    ["four categories", { ...validReport, categories: validReport.categories.slice(1) }],
    ["unknown category", { ...validReport, categories: [{ name: "legal", score: 1, tested: true }, ...validReport.categories.slice(1)] }],
    [
      "tested category without a score",
      { ...validReport, categories: [{ name: "security", score: null, tested: true }, ...validReport.categories.slice(1)] },
    ],
    [
      "untested category with a score",
      { ...validReport, categories: [...validReport.categories.slice(0, 1), { name: "seo", score: 100, tested: false }, ...validReport.categories.slice(2)] },
    ],
  ])("rejects %s", (_name, report) => {
    expect(ReportSchema.safeParse(report).success).toBe(false);
  });
});

describe("report writing", () => {
  it("round-trips through a temp folder", async () => {
    const dir = await tmp();
    const file = await writeJsonReport(validReport, dir);
    expect(path.basename(file)).toBe(REPORT_FILENAME);
    expect(ReportSchema.parse(JSON.parse(await readFile(file, "utf8")))).toEqual(validReport);
  });

  it("writes nothing when the report is invalid", async () => {
    const dir = await tmp();
    await expect(writeJsonReport({ ...validReport, scannedAt: "nope" }, dir)).rejects.toThrow();
    expect(existsSync(path.join(dir, REPORT_FILENAME))).toBe(false);
  });

  it("buildReport keeps only the report fields and flattens the score", () => {
    const result = {
      url: validReport.url,
      scannedAt: validReport.scannedAt,
      findings: validReport.findings,
      detected: validReport.detected,
      notTested: validReport.notTested,
      checksRun: 3,
      ctx: { html: "<p>secret</p>" },
      score: computeScore({ findings: [{ category: "security", severity: "low" }], testedCategories: ["security"] }),
      verified: false,
    } as unknown as ScanResult;
    const report = buildReport(result);
    expect(Object.keys(report).sort()).toEqual(
      ["categories", "detected", "findings", "notTested", "partial", "scannedAt", "score", "url", "verdict", "verified"],
    );
    expect(report).toMatchObject({ score: 95, verdict: "ALMOST READY", partial: true, verified: false });
  });
});
