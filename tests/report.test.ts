import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildReport, REPORT_FILENAME, ReportSchema, writeJsonReport, type Report } from "../src/report/json.js";

const valid: Report = {
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
    expect(ReportSchema.safeParse(valid).success).toBe(true);
    expect(ReportSchema.safeParse({ ...valid, findings: [], detected: [], notTested: [] }).success).toBe(true);
  });

  it.each([
    ["missing findings", { ...valid, findings: undefined }],
    ["unknown severity", { ...valid, findings: [{ ...valid.findings[0], severity: "urgent" }] }],
    ["bad date", { ...valid, scannedAt: "yesterday" }],
    ["bad url", { ...valid, url: "not a url" }],
    ["detection without stack", { ...valid, detected: [{ checkId: "SEC-005", note: "x" }] }],
  ])("rejects %s", (_name, report) => {
    expect(ReportSchema.safeParse(report).success).toBe(false);
  });
});

describe("report writing", () => {
  it("round-trips through a temp folder", async () => {
    const dir = await tmp();
    const file = await writeJsonReport(valid, dir);
    expect(path.basename(file)).toBe(REPORT_FILENAME);
    expect(ReportSchema.parse(JSON.parse(await readFile(file, "utf8")))).toEqual(valid);
  });

  it("writes nothing when the report is invalid", async () => {
    const dir = await tmp();
    await expect(writeJsonReport({ ...valid, scannedAt: "nope" }, dir)).rejects.toThrow();
    expect(existsSync(path.join(dir, REPORT_FILENAME))).toBe(false);
  });

  it("buildReport keeps only the report fields", () => {
    const report = buildReport({ ...valid, checksRun: 3, ctx: { html: "<p>secret</p>" } } as unknown as Report);
    expect(Object.keys(report).sort()).toEqual(["detected", "findings", "notTested", "scannedAt", "url"]);
  });
});
