import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "../fixtures/server.js";
import { cardHtml, toCardData } from "../src/report/card.js";
import { buildReport } from "../src/report/json.js";
import { runScan } from "../src/runner.js";

let good: FixtureServer;

beforeAll(async () => {
  good = await startFixtureServer("good");
});

afterAll(async () => {
  await good.close();
});

describe("DATABASE NOT TESTED tag on a real scan", () => {
  it("appears on the good fixture's card: Supabase detected, no active check ran", async () => {
    const report = buildReport(await runScan(good.url + "/", { skipPerformance: true }));
    expect(report.findings).toEqual([]);
    expect(report.detected).toEqual([expect.objectContaining({ stack: "supabase", url: "fakeproject.supabase.co" })]);
    expect(report.verified).toBe(false);

    const data = toCardData(report);
    expect(data.databaseNotTested).toBe(true);
    for (const size of ["landscape", "square"] as const) {
      const html = cardHtml(data, size);
      expect(html).toContain("Database not tested");
      expect(html).not.toContain(">Verified<");
    }
  });

  it("is replaced by the VERIFIED badge once active checks ran", async () => {
    const report = { ...buildReport(await runScan(good.url + "/", { skipPerformance: true })), verified: true };
    const html = cardHtml(toCardData(report), "landscape");
    expect(html).toContain("Verified");
    expect(html).not.toContain("Database not tested");
  });

  it("does not appear when Supabase is not detected", async () => {
    const report = { ...buildReport(await runScan(good.url + "/", { skipPerformance: true })), detected: [] };
    expect(cardHtml(toCardData(report), "landscape")).not.toContain("Database not tested");
  });
});
