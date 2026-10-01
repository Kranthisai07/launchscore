import { describe, expect, it } from "vitest";
import { computeScore, DEDUCTIONS, verdictFor, type ScoreInput } from "../src/score.js";
import type { Category, Severity } from "../src/types.js";

const ALL: Category[] = ["security", "seo", "accessibility", "performance", "hygiene"];
const f = (category: Category, severity: Severity) => ({ category, severity });
const score = (input: Partial<ScoreInput> & { findings?: ScoreInput["findings"] }) =>
  computeScore({ findings: [], testedCategories: ALL, ...input });
const byName = (result: ReturnType<typeof computeScore>, name: Category) =>
  result.categories.find((c) => c.name === name)!;

describe("category scores", () => {
  it("starts every tested category at 100", () => {
    const result = score({});
    expect(result.categories.map((c) => [c.name, c.score, c.tested])).toEqual(
      ALL.map((name) => [name, 100, true]),
    );
    expect(result.score).toBe(100);
  });

  it.each([
    ["critical", 40],
    ["high", 70],
    ["medium", 85],
    ["low", 95],
  ] as const)("deducts per %s finding", (severity, expected) => {
    expect(byName(score({ findings: [f("seo", severity)] }), "seo").score).toBe(expected);
    expect(DEDUCTIONS[severity]).toBe(100 - expected);
  });

  it("adds deductions inside a category and leaves other categories alone", () => {
    const result = score({ findings: [f("seo", "high"), f("seo", "medium"), f("seo", "low")] });
    expect(byName(result, "seo").score).toBe(50);
    expect(byName(result, "security").score).toBe(100);
  });

  it("floors at 0", () => {
    const result = score({ findings: [f("security", "critical"), f("security", "critical"), f("security", "high")] });
    expect(byName(result, "security").score).toBe(0);
  });

  it("returns the five categories in a fixed order", () => {
    expect(score({}).categories.map((c) => c.name)).toEqual(ALL);
  });
});

describe("untested categories", () => {
  it("shows null and tested false, never 100", () => {
    const result = score({ testedCategories: ["security", "hygiene"] });
    for (const name of ["seo", "accessibility", "performance"] as const) {
      expect(byName(result, name)).toEqual({ name, score: null, tested: false });
    }
    expect(result.partial).toBe(true);
  });

  it("is not scored when nothing was tested", () => {
    const result = score({ testedCategories: [] });
    expect(result).toMatchObject({ score: null, verdict: "NOT SCORED", partial: true });
    expect(result.categories.every((c) => c.score === null && !c.tested)).toBe(true);
  });

  it("renormalizes the weights over tested categories only", () => {
    // security 0 (weight 40) + seo 100 (weight 15) = 1500 / 55
    const result = score({ testedCategories: ["security", "seo"], findings: [f("security", "critical"), f("security", "critical")] });
    expect(result.score).toBe(27);
  });

  it("scores a single tested category as that category", () => {
    expect(score({ testedCategories: ["hygiene"], findings: [f("hygiene", "medium")] }).score).toBe(85);
  });

  it("ignores findings in a category that was not tested", () => {
    const result = score({ testedCategories: ["seo"], findings: [f("security", "critical")] });
    expect(result).toMatchObject({ score: 100 });
    expect(result.verdict).not.toBe("BLOCKED: CRITICAL ISSUE");
  });
});

describe("weighted total", () => {
  it("weights security at 40 and the rest at 15 (the bad fixture's numbers)", () => {
    const result = score({
      testedCategories: ["security", "seo", "hygiene"],
      findings: [
        f("security", "critical"), f("security", "critical"), f("security", "medium"),
        f("security", "low"), f("security", "low"), f("security", "low"),
        f("seo", "high"), f("seo", "medium"),
        f("hygiene", "medium"), f("hygiene", "medium"), f("hygiene", "medium"), f("hygiene", "medium"),
      ],
    });
    expect(result.categories.map((c) => c.score)).toEqual([0, 55, null, null, 40]);
    expect(result.score).toBe(20); // (0*40 + 55*15 + 40*15) / 70 = 20.36
    expect(result.verdict).toBe("BLOCKED: CRITICAL ISSUE");
    expect(result.partial).toBe(true);
  });

  it("rounds to a whole number", () => {
    // seo 85 and hygiene 100 over weights 15 + 15 = 92.5 -> 93 (round half up)
    const result = score({ testedCategories: ["seo", "hygiene"], findings: [f("seo", "medium")] });
    expect(result.score).toBe(93);
  });
});

describe("critical cap", () => {
  it("caps the total at 49 even when the weighted average is higher", () => {
    // security 40, everything else 100: average 76
    const result = score({ findings: [f("security", "critical")] });
    expect(result.score).toBe(49);
    expect(result.verdict).toBe("BLOCKED: CRITICAL ISSUE");
  });

  it("leaves a total already under 49 alone", () => {
    const result = score({ testedCategories: ["security"], findings: [f("security", "critical"), f("security", "critical")] });
    expect(result.score).toBe(0);
    expect(result.verdict).toBe("BLOCKED: CRITICAL ISSUE");
  });

  it("a critical in a tested category blocks even a partial scan", () => {
    expect(score({ testedCategories: ["security"], findings: [f("security", "critical")] }).verdict).toBe(
      "BLOCKED: CRITICAL ISSUE",
    );
  });
});

describe("verdicts", () => {
  it.each([
    [100, false, false, "READY TO LAUNCH"],
    [90, false, false, "READY TO LAUNCH"],
    [89, false, false, "ALMOST READY"],
    [70, false, false, "ALMOST READY"],
    [69, false, false, "NEEDS WORK"],
    [0, false, false, "NEEDS WORK"],
    [49, true, false, "BLOCKED: CRITICAL ISSUE"],
    [100, true, false, "BLOCKED: CRITICAL ISSUE"],
    [100, false, true, "ALMOST READY"],
    [90, false, true, "ALMOST READY"],
    [75, false, true, "ALMOST READY"],
    [50, false, true, "NEEDS WORK"],
  ] as const)("total %i, critical %s, partial %s is %s", (total, critical, partial, expected) => {
    expect(verdictFor(total, critical, partial)).toBe(expected);
  });
});

describe("partial scans cap the verdict at ALMOST READY", () => {
  it("is READY TO LAUNCH only when every category was tested and the scan was complete", () => {
    expect(score({}).verdict).toBe("READY TO LAUNCH");
    expect(score({}).partial).toBe(false);
  });

  it("caps when a category is untested (the good fixture: 100, ALMOST READY)", () => {
    const result = score({ testedCategories: ["security", "seo", "hygiene"] });
    expect(result).toMatchObject({ score: 100, verdict: "ALMOST READY", partial: true });
  });

  it("caps when the scan is incomplete (a skipped script or a crashed check)", () => {
    const result = score({ incomplete: true });
    expect(result).toMatchObject({ score: 100, verdict: "ALMOST READY", partial: true });
  });

  it("does not touch lower verdicts", () => {
    expect(
      score({ incomplete: true, testedCategories: ["seo"], findings: [f("seo", "high"), f("seo", "high"), f("seo", "low")] }).verdict,
    ).toBe("NEEDS WORK");
  });
});

describe("direct category scores (performance from Lighthouse)", () => {
  it("uses the direct score instead of deductions, and ignores findings in that category", () => {
    const result = score({
      directScores: { performance: 62 },
      findings: [f("performance", "low"), f("performance", "high"), f("seo", "medium")],
    });
    expect(byName(result, "performance")).toEqual({ name: "performance", score: 62, tested: true });
    expect(byName(result, "seo").score).toBe(85); // other categories still deduct
  });

  it("weights it like any other tested category (15) in the total", () => {
    // security 100 (40) + performance 40 (15) over 55 = (4000 + 600) / 55 = 83.6
    const result = score({ testedCategories: ["security", "performance"], directScores: { performance: 40 } });
    expect(result.score).toBe(84);
  });

  it("rounds and clamps", () => {
    expect(byName(score({ directScores: { performance: 61.6 } }), "performance").score).toBe(62);
    expect(byName(score({ directScores: { performance: 140 } }), "performance").score).toBe(100);
    expect(byName(score({ directScores: { performance: -5 } }), "performance").score).toBe(0);
  });

  it("is ignored when the category was not tested: it stays null, never a number", () => {
    const result = score({ testedCategories: ["security"], directScores: { performance: 90 } });
    expect(byName(result, "performance")).toEqual({ name: "performance", score: null, tested: false });
  });

  it("does not stop a critical finding elsewhere from capping the total", () => {
    const result = score({ directScores: { performance: 100 }, findings: [f("security", "critical")] });
    expect(result).toMatchObject({ score: 49, verdict: "BLOCKED: CRITICAL ISSUE" });
  });

  it("allows READY TO LAUNCH when all five categories are tested and complete", () => {
    expect(score({ directScores: { performance: 96 } })).toMatchObject({ verdict: "READY TO LAUNCH", partial: false });
  });
});
