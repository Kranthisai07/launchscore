import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createPerf001, mapTips, MIN_SAVING_MS, savingMs } from "../../src/checks/perf-001.js";
import { trimLhr, type LighthouseAudit, type LighthouseSummary } from "../../src/lighthouse.js";
import { makeContext } from "../helpers/context.js";

const recorded = (name: string): LighthouseSummary =>
  JSON.parse(readFileSync(new URL(`../recorded/lighthouse-${name}.json`, import.meta.url), "utf8"));

const audit = (overrides: Partial<LighthouseAudit> = {}): LighthouseAudit => ({
  id: "some-audit",
  title: "Some audit",
  score: 0,
  scoreDisplayMode: "metricSavings",
  metricSavings: { FCP: 1000, LCP: 1000 },
  ...overrides,
});
const tips = (audits: LighthouseAudit[]) => mapTips({ score: 0.5, audits });

describe("mapTips on recorded Lighthouse output", () => {
  it("bad fixture: the three biggest savings, in order, all low and plain English", () => {
    const findings = mapTips(recorded("bad"));
    expect(findings.map((f) => f.title)).toEqual([
      "Returning visitors download your files again (no browser caching)",
      "Your JavaScript files are bigger than they need to be (not minified)",
      "Some files hold up your page until they finish downloading",
    ]);
    expect(findings.every((f) => f.severity === "low" && f.checkId === "PERF-001")).toBe(true);
    expect(findings.map((f) => f.evidence)).toEqual([
      "Could save about 15.5 s",
      "Could save about 8.1 s and 1.4 MB",
      "Could save about 7.8 s",
    ]);
  });

  it("bad fixture: skips audits with no estimated saving", () => {
    const ids = recorded("bad").audits.filter((a) => a.score !== null && a.score < 0.9 && savingMs(a) === 0).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["lcp-discovery-insight", "network-dependency-tree-insight"]));
    expect(mapTips(recorded("bad")).map((f) => f.title).join()).not.toContain("found late");
  });

  it("good fixture: a 150 ms render-blocking stylesheet is not worth a tip", () => {
    expect(mapTips(recorded("good"))).toEqual([]);
  });

  it("records real performance scores: bad is poor, good is perfect", () => {
    expect(recorded("bad").score).toBeLessThan(0.8);
    expect(recorded("good").score).toBe(1);
  });
});

describe("mapTips rules", () => {
  it("takes the largest saving across FCP, LCP, TBT and INP, and ignores CLS", () => {
    expect(savingMs(audit({ metricSavings: { FCP: 400, LCP: 900, CLS: 99999 } }))).toBe(900);
    expect(savingMs(audit({ metricSavings: { TBT: 700 } }))).toBe(700);
    expect(savingMs(audit({ metricSavings: { INP: 650 } }))).toBe(650);
    expect(savingMs(audit({ metricSavings: { CLS: 5 } }))).toBe(0);
    expect(savingMs(audit({ metricSavings: undefined }))).toBe(0);
  });

  it(`needs at least ${MIN_SAVING_MS} ms of estimated saving`, () => {
    expect(tips([audit({ metricSavings: { LCP: 299 } })])).toEqual([]);
    expect(tips([audit({ metricSavings: { LCP: 300 } })])).toHaveLength(1);
  });

  it("ignores audits Lighthouse already rates good (score 0.9 or more) and ones without a score", () => {
    expect(tips([audit({ score: 0.9 }), audit({ score: 1 }), audit({ score: null })])).toEqual([]);
    expect(tips([audit({ score: 0.89 })])).toHaveLength(1);
  });

  it("ignores not applicable and errored audits", () => {
    expect(tips([audit({ scoreDisplayMode: "notApplicable" }), audit({ scoreDisplayMode: "error" })])).toEqual([]);
  });

  it("keeps at most three, largest first, ties broken by id", () => {
    const findings = tips([
      audit({ id: "b", title: "B", metricSavings: { LCP: 500 } }),
      audit({ id: "a", title: "A", metricSavings: { LCP: 500 } }),
      audit({ id: "c", title: "C", metricSavings: { LCP: 5000 } }),
      audit({ id: "d", title: "D", metricSavings: { LCP: 900 } }),
      audit({ id: "e", title: "E", metricSavings: { LCP: 400 } }),
    ]);
    expect(findings.map((f) => f.title)).toEqual(["Speed tip: C", "Speed tip: D", "Speed tip: A"]);
  });

  it("falls back to Lighthouse's title for unknown audits, with a web.dev pointer", () => {
    const [finding] = tips([audit({ title: "Avoid enormous network payloads" })]);
    expect(finding.title).toBe("Speed tip: Avoid enormous network payloads");
    expect(finding.fix).toContain("web.dev");
  });

  it.each([
    [320, "Could save about 320 ms"],
    [345, "Could save about 350 ms"],
    [1000, "Could save about 1.0 s"],
    [12_340, "Could save about 12.3 s"],
  ])("formats %i ms as %s", (ms, expected) => {
    expect(tips([audit({ metricSavings: { LCP: ms } })])[0].evidence).toBe(expected);
  });

  it.each([
    [50_000, "Could save about 1.0 s and 49 KB"],
    [3 * 1024 * 1024, "Could save about 1.0 s and 3.0 MB"],
  ])("adds bytes when known (%i)", (bytes, expected) => {
    expect(tips([audit({ metricSavings: { LCP: 1000 }, overallSavingsBytes: bytes })])[0].evidence).toBe(expected);
  });

  it("writes a plain-English reason and fix for every named audit", () => {
    const ids = [
      "render-blocking-insight", "cache-insight", "document-latency-insight", "image-delivery-insight", "lcp-discovery-insight",
      "network-dependency-tree-insight", "legacy-javascript-insight", "duplicated-javascript-insight", "font-display-insight",
      "third-parties-insight", "modern-http-insight", "dom-size-insight", "unminified-javascript", "unminified-css",
      "unused-javascript", "unused-css-rules", "redirects", "server-response-time",
    ];
    for (const id of ids) {
      const [finding] = tips([audit({ id, title: "Lighthouse wording" })]);
      expect(finding.title, id).not.toContain("Speed tip");
      expect(finding.why.length, id).toBeGreaterThan(15);
      expect(finding.fix.length, id).toBeGreaterThan(15);
    }
  });
});

describe("trimLhr", () => {
  it("keeps only audits that estimate a saving, with the fields we read", () => {
    const lhr = {
      categories: { performance: { score: 0.73 } },
      audits: {
        "first-contentful-paint": { title: "FCP", score: 0.5, numericValue: 3000 },
        "render-blocking-insight": {
          title: "Render-blocking requests",
          score: 0,
          scoreDisplayMode: "metricSavings",
          metricSavings: { FCP: 1200, LCP: 0, CLS: "n/a" },
          details: { overallSavingsBytes: 4096 },
        },
        "viewport-insight": { title: "Viewport", score: null, scoreDisplayMode: "notApplicable", metricSavings: { INP: 0 } },
      },
    };
    expect(trimLhr(lhr)).toEqual({
      score: 0.73,
      audits: [
        {
          id: "render-blocking-insight",
          title: "Render-blocking requests",
          score: 0,
          scoreDisplayMode: "metricSavings",
          metricSavings: { FCP: 1200, LCP: 0 },
          overallSavingsBytes: 4096,
        },
        { id: "viewport-insight", title: "Viewport", score: null, scoreDisplayMode: "notApplicable", metricSavings: { INP: 0 }, overallSavingsBytes: undefined },
      ],
    });
  });

  it("copes with a missing score or audits", () => {
    expect(trimLhr({})).toEqual({ score: null, audits: [] });
    expect(trimLhr({ categories: { performance: { score: "bad" } } }).score).toBeNull();
  });
});

describe("PERF-001 check", () => {
  it("sets the performance category score from Lighthouse and returns the tips", async () => {
    const measure = vi.fn(async () => recorded("bad"));
    const ctx = makeContext({ finalUrl: "https://shop.test/final" });
    const findings = await createPerf001(measure).run(ctx);
    expect(measure).toHaveBeenCalledWith("https://shop.test/final");
    expect(ctx.categoryScores.performance).toBe(57);
    expect(findings).toHaveLength(3);
  });

  it.each([
    [1, 100],
    [0.995, 100],
    [0.004, 0],
    [0, 0],
  ])("turns a Lighthouse score of %s into %i", async (score, expected) => {
    const ctx = makeContext();
    await createPerf001(async () => ({ score, audits: [] })).run(ctx);
    expect(ctx.categoryScores.performance).toBe(expected);
  });

  it("throws, setting no score, when Lighthouse gave no score", async () => {
    const ctx = makeContext();
    await expect(createPerf001(async () => ({ score: null, audits: [] })).run(ctx)).rejects.toThrow("performance score");
    expect(ctx.categoryScores).toEqual({});
  });

  it("lets a Lighthouse failure or timeout through for the runner to record", async () => {
    const ctx = makeContext();
    await expect(createPerf001(async () => Promise.reject(new Error("Lighthouse timed out after 60 s"))).run(ctx)).rejects.toThrow("timed out");
    expect(ctx.categoryScores).toEqual({});
  });

  it("is a performance-category passive check", () => {
    const check = createPerf001();
    expect(check).toMatchObject({ id: "PERF-001", category: "performance", mode: "passive" });
  });
});
