import type { Category, Severity } from "./types.js";

export const CATEGORY_ORDER: Category[] = ["security", "seo", "accessibility", "performance", "hygiene"];

export const CATEGORY_WEIGHTS: Record<Category, number> = {
  security: 40,
  seo: 15,
  accessibility: 15,
  performance: 15,
  hygiene: 15,
};

export const DEDUCTIONS: Record<Severity, number> = { critical: 60, high: 30, medium: 15, low: 5 };

export const CRITICAL_CAP = 49;

export type Verdict = "READY TO LAUNCH" | "ALMOST READY" | "NEEDS WORK" | "BLOCKED: CRITICAL ISSUE" | "NOT SCORED";

export interface CategoryScore {
  name: Category;
  score: number | null; // null when the category was not tested: never 100
  tested: boolean;
}

export interface ScoreResult {
  score: number | null; // null only when no category was tested
  verdict: Verdict;
  categories: CategoryScore[];
  partial: boolean;
}

export interface ScoreInput {
  findings: { category: Category; severity: Severity }[];
  testedCategories: Iterable<Category>;
  // The scan itself was incomplete (a script was skipped or a check crashed).
  incomplete?: boolean;
  // A category measured directly (performance, from Lighthouse): its 0 to 100 score is used as is and
  // its findings do not deduct. Ignored for a category that was not tested.
  directScores?: Partial<Record<Category, number>>;
}

// Thresholds apply to the rounded total the user sees. `partial` caps the verdict at "ALMOST READY".
export function verdictFor(total: number, hasCritical: boolean, partial = false): Verdict {
  if (hasCritical) return "BLOCKED: CRITICAL ISSUE";
  if (total >= 90) return partial ? "ALMOST READY" : "READY TO LAUNCH";
  if (total >= 70) return "ALMOST READY";
  return "NEEDS WORK";
}

export function computeScore(input: ScoreInput): ScoreResult {
  const tested = new Set(input.testedCategories);

  const categories: CategoryScore[] = CATEGORY_ORDER.map((name) => {
    if (!tested.has(name)) return { name, score: null, tested: false };
    const direct = input.directScores?.[name];
    if (direct !== undefined) return { name, score: Math.min(100, Math.max(0, Math.round(direct))), tested: true };
    const deducted = input.findings
      .filter((f) => f.category === name)
      .reduce((sum, f) => sum + DEDUCTIONS[f.severity], 0);
    return { name, score: Math.max(0, 100 - deducted), tested: true };
  });

  const partial = categories.some((c) => !c.tested) || input.incomplete === true;
  const scored = categories.filter((c): c is CategoryScore & { score: number } => c.score !== null);
  if (scored.length === 0) return { score: null, verdict: "NOT SCORED", categories, partial };

  const weight = scored.reduce((sum, c) => sum + CATEGORY_WEIGHTS[c.name], 0);
  const average = scored.reduce((sum, c) => sum + c.score * CATEGORY_WEIGHTS[c.name], 0) / weight;
  const hasCritical = input.findings.some((f) => tested.has(f.category) && f.severity === "critical");
  const score = Math.min(Math.round(average), hasCritical ? CRITICAL_CAP : 100);

  return { score, verdict: verdictFor(score, hasCritical, partial), categories, partial };
}
