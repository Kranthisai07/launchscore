import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startFixtureServer, type FixtureServer } from "../fixtures/server.js";
import { FAKE_SECRETS } from "../fixtures/secrets.js";
import { cardHtml, CARD_SIZES, renderCards, toCardData } from "../src/report/card.js";
import { buildReport, type Report } from "../src/report/json.js";
import { runScan } from "../src/runner.js";

const pngSize = (png: Buffer): { width: number; height: number } => ({
  width: png.readUInt32BE(16),
  height: png.readUInt32BE(20),
});

describe("renderCards", () => {
  let dir: string;
  let files: string[];
  let bad: FixtureServer;
  let badReport: Report;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "launchscore-card-"));
    bad = await startFixtureServer("bad");
    badReport = buildReport(await runScan(bad.url + "/", { skipPerformance: true }));
    files = await renderCards(badReport, dir);
  });

  afterAll(async () => {
    await bad.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("writes both files with the exact dimensions", async () => {
    expect(files.map((f) => path.basename(f))).toEqual([CARD_SIZES.landscape.file, CARD_SIZES.square.file]);
    const landscape = pngSize(await readFile(files[0]));
    const square = pngSize(await readFile(files[1]));
    expect(landscape).toEqual({ width: 1200, height: 630 });
    expect(square).toEqual({ width: 1080, height: 1350 });
  });

  it("writes real PNG files", async () => {
    for (const file of files) {
      const png = await readFile(file);
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(png.length).toBeGreaterThan(10_000);
    }
  });

  it("the bad fixture's card HTML contains no evidence strings and no secret", () => {
    expect(badReport.findings.length).toBe(27);
    for (const size of ["landscape", "square"] as const) {
      const html = cardHtml(toCardData(badReport), size);
      for (const f of badReport.findings) expect(html, f.evidence).not.toContain(f.evidence);
      for (const secret of [FAKE_SECRETS.STRIPE_SK_LIVE, FAKE_SECRETS.SUPABASE_SERVICE_JWT]) {
        expect(html).not.toContain(secret);
        expect(html).not.toContain(secret.slice(0, 4) + "…" + secret.slice(-4));
      }
      expect(html).not.toContain("/app.js");
      expect(html).toContain("127.0.0.1");
      expect(html).not.toContain(bad.url);
    }
  });

  it("the bad fixture's card is red and says BLOCKED: CRITICAL ISSUE", () => {
    const html = cardHtml(toCardData(badReport), "landscape");
    expect(html).toContain("--accent:#FF2A2A");
    expect(html).toContain("BLOCKED: CRITICAL ISSUE");
    expect(html).toContain(">4<");
  });
});
