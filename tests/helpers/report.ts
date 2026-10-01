import type { Report } from "../../src/report/json.js";
import { computeScore } from "../../src/score.js";
import type { Finding } from "../../src/types.js";

export const ALL_CATEGORIES = ["security", "seo", "accessibility", "performance", "hygiene"] as const;

// A finding whose why, evidence and fix carry markers, so tests can prove where text does or does not appear.
export const finding = (
  title: string,
  severity: Finding["severity"],
  evidence = "EVIDENCE-SHOULD-NEVER-APPEAR",
  extra: Partial<Finding> = {},
): Finding => ({
  checkId: "TEST-001",
  severity,
  title,
  why: "WHY-SHOULD-NEVER-APPEAR",
  evidence,
  fix: "FIX-SHOULD-NEVER-APPEAR",
  ...extra,
});

export function makeReport(overrides: Partial<Report> = {}, scoreInput?: Parameters<typeof computeScore>[0]): Report {
  const s = computeScore(scoreInput ?? { findings: [], testedCategories: ALL_CATEGORIES });
  return {
    url: "https://shop.example.org:8443/private/path?token=SECRET-QUERY#frag",
    scannedAt: "2026-10-01T00:00:00.000Z",
    findings: [],
    detected: [],
    notTested: [],
    score: s.score,
    verdict: s.verdict,
    categories: s.categories,
    partial: s.partial,
    verified: false,
    ...overrides,
  };
}
