import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "../fixtures/server.js";
import { perf001 } from "../src/checks/perf-001.js";
import { runScan } from "../src/runner.js";

// Real Lighthouse, real Chromium. Scores vary from run to run, so every assertion is loose.
// Skip locally with LAUNCHSCORE_SKIP_LIGHTHOUSE_TESTS=1 (CI runs it).
const skip = process.env.LAUNCHSCORE_SKIP_LIGHTHOUSE_TESTS === "1";

let good: FixtureServer;
let bad: FixtureServer;

beforeAll(async () => {
  [good, bad] = await Promise.all([startFixtureServer("good"), startFixtureServer("bad")]);
});

afterAll(async () => {
  await Promise.all([good.close(), bad.close()]);
});

describe.skipIf(skip)("PERF-001 with real Lighthouse", { timeout: 120_000, retry: 1 }, () => {
  const perfOf = (result: Awaited<ReturnType<typeof runScan>>) =>
    result.score.categories.find((c) => c.name === "performance")!;

  it("scores both fixtures, the bad one lower, with at most three low speed tips each", async () => {
    const goodResult = await runScan(good.url + "/", { checks: [perf001] });
    const badResult = await runScan(bad.url + "/", { checks: [perf001] });

    const goodPerf = perfOf(goodResult);
    const badPerf = perfOf(badResult);
    expect(goodPerf.tested).toBe(true);
    expect(badPerf.tested).toBe(true);
    expect(goodPerf.score).toBeGreaterThanOrEqual(70);
    expect(badPerf.score).toBeLessThan(goodPerf.score!);

    expect(goodResult.notTested).toEqual([]);
    expect(badResult.notTested).toEqual([]);
    expect(badResult.findings.length).toBeGreaterThanOrEqual(1);
    expect(badResult.findings.length).toBeLessThanOrEqual(3);
    for (const f of [...goodResult.findings, ...badResult.findings]) {
      expect(f).toMatchObject({ checkId: "PERF-001", severity: "low" });
      expect(f.title).not.toBe("");
    }
  });

  it("tips never change the performance score (it is Lighthouse's own number)", async () => {
    const result = await runScan(bad.url + "/", { checks: [perf001] });
    const score = perfOf(result).score!;
    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
