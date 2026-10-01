import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startFixtureServer, type FixtureServer } from "../fixtures/server.js";
import { FAKE_SECRETS } from "../fixtures/secrets.js";
import { cardHtml, CARD_SIZES, PALETTE, renderCards, toCardData, VERDICT_ACCENT, type CardSize } from "../src/report/card.js";
import { buildReport, type Report } from "../src/report/json.js";
import { runScan } from "../src/runner.js";
import { computeScore } from "../src/score.js";
import type { Finding } from "../src/types.js";

const ALL = ["security", "seo", "accessibility", "performance", "hygiene"] as const;

const finding = (title: string, severity: Finding["severity"], evidence = "EVIDENCE-SHOULD-NEVER-APPEAR"): Finding => ({
  checkId: "TEST-001",
  severity,
  title,
  why: "WHY-SHOULD-NEVER-APPEAR",
  evidence,
  fix: "FIX-SHOULD-NEVER-APPEAR",
});

function makeReport(overrides: Partial<Report> = {}, scoreInput?: Parameters<typeof computeScore>[0]): Report {
  const s = computeScore(scoreInput ?? { findings: [], testedCategories: ALL });
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

// WCAG relative-luminance contrast ratio
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const pngSize = (png: Buffer): { width: number; height: number } => ({
  width: png.readUInt32BE(16),
  height: png.readUInt32BE(20),
});

describe("toCardData", () => {
  it("keeps only the hostname, never the path, query, port or fragment", () => {
    const data = toCardData(makeReport());
    expect(data.hostname).toBe("shop.example.org");
    expect(JSON.stringify(data)).not.toMatch(/private|SECRET-QUERY|8443|frag/);
  });

  it("takes the three most severe finding titles, in severity order, and nothing else", () => {
    const report = makeReport({
      findings: [
        finding("low one", "low"),
        finding("critical one", "critical"),
        finding("medium one", "medium"),
        finding("high one", "high"),
        finding("critical two", "critical"),
      ],
    });
    const data = toCardData(report);
    expect(data.issues).toEqual(["critical one", "critical two", "high one"]);
    expect(JSON.stringify(data)).not.toContain("SHOULD-NEVER-APPEAR");
  });

  it("flags 'database not tested' only when Supabase was detected and active checks did not run", () => {
    const supabase = [{ checkId: "SEC-005", stack: "supabase", note: "n" }];
    expect(toCardData(makeReport({ detected: supabase, verified: false })).databaseNotTested).toBe(true);
    expect(toCardData(makeReport({ detected: supabase, verified: true })).databaseNotTested).toBe(false);
    expect(toCardData(makeReport({ detected: [], verified: false })).databaseNotTested).toBe(false);
  });
});

describe("cardHtml", () => {
  const sizes: CardSize[] = ["landscape", "square"];

  it.each(sizes)("%s: shows titles and hostname but no evidence, explanation, fix or URL path", (size) => {
    const report = makeReport({ findings: [finding("A secret key is visible", "critical")] });
    const html = cardHtml(toCardData(report), size);
    expect(html).toContain("A secret key is visible");
    expect(html).toContain("shop.example.org");
    for (const hidden of ["EVIDENCE-SHOULD-NEVER-APPEAR", "WHY-SHOULD", "FIX-SHOULD", "private", "SECRET-QUERY", "8443", "https://"]) {
      expect(html, hidden).not.toContain(hidden);
    }
  });

  it("is self-contained: no external requests", () => {
    const html = cardHtml(toCardData(makeReport()), "landscape");
    expect(html).not.toMatch(/(?:src|href)=["']https?:/i);
    expect(html).not.toMatch(/url\(["']?https?:/i);
    expect(html).not.toContain("@import");
  });

  it("escapes HTML in titles and the hostname", () => {
    const html = cardHtml(toCardData(makeReport({ findings: [finding('<img src=x onerror="alert(1)">', "low")] })), "landscape");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("greys untested categories with 'NOT TESTED' and no number", () => {
    const report = makeReport({}, { findings: [], testedCategories: ["security"] });
    const html = cardHtml(toCardData(report), "landscape");
    expect(html.match(/NOT TESTED/g)).toHaveLength(4);
    expect(html.match(/class="row untested"/g)).toHaveLength(4);
    expect(html.match(/class="row"/g)).toHaveLength(1);
  });

  it("fills 20 segments proportionally to the category score", () => {
    const report = makeReport({}, { findings: [{ category: "seo", severity: "high" }, { category: "seo", severity: "medium" }], testedCategories: ALL });
    const seoRow = cardHtml(toCardData(report), "landscape").split('<div class="row">')[2]; // security, seo
    expect(seoRow.match(/<i class="on">/g)).toHaveLength(11); // score 55 -> 11 of 20
    expect(seoRow.match(/<i/g)).toHaveLength(20);
  });

  it.each(Object.entries(VERDICT_ACCENT))("uses the accent for %s", (verdict, accent) => {
    const report = makeReport({ verdict: verdict as Report["verdict"] });
    expect(cardHtml(toCardData(report), "landscape")).toContain(`--accent:${accent}`);
  });

  it("shows the partial, verified and database tags", () => {
    const supabase = [{ checkId: "SEC-005", stack: "supabase", note: "n" }];
    const partial = cardHtml(toCardData(makeReport({ partial: true })), "landscape");
    expect(partial).toContain("Partial scan");
    expect(cardHtml(toCardData(makeReport({ partial: false })), "landscape")).not.toContain("Partial scan");
    expect(cardHtml(toCardData(makeReport({ verified: true })), "landscape")).toContain("Verified");
    const db = cardHtml(toCardData(makeReport({ detected: supabase, verified: false })), "landscape");
    expect(db).toContain("Database not tested");
    expect(db).not.toContain(">Verified<");
    expect(cardHtml(toCardData(makeReport({ detected: supabase, verified: true })), "landscape")).not.toContain("Database not tested");
  });

  it("says 'NO ISSUES FOUND' when there are none, and N/A when not scored", () => {
    expect(cardHtml(toCardData(makeReport()), "landscape")).toContain("NO ISSUES FOUND");
    const notScored = makeReport({}, { findings: [], testedCategories: [] });
    const html = cardHtml(toCardData(notScored), "landscape");
    expect(html).toContain("N/A");
    expect(html).toContain("NOT SCORED");
    expect(html).not.toContain('class="of"');
  });

  it("never uses an em dash or en dash", () => {
    const report = makeReport({ partial: true, findings: [finding("Plain title", "high")] });
    for (const size of sizes) expect(cardHtml(toCardData(report), size)).not.toMatch(/[–—]/);
  });

  it("includes the launchscore wordmark and the install command", () => {
    const html = cardHtml(toCardData(makeReport()), "square");
    expect(html).toContain("launchscore");
    expect(html).toContain("npx launchscore");
  });
});

describe("palette contrast (WCAG AA)", () => {
  it.each(Object.entries(VERDICT_ACCENT))("%s accent against the background, and the background against the accent", (_verdict, accent) => {
    expect(contrast(accent, PALETTE.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("text and muted text pass on the background", () => {
    expect(contrast(PALETTE.text, PALETTE.bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(PALETTE.muted, PALETTE.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("uses off-black and off-white, never pure black or white", () => {
    expect(PALETTE.bg).not.toBe("#000000");
    expect(PALETTE.text.toLowerCase()).not.toBe("#ffffff");
  });
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
    expect(badReport.findings.length).toBe(28);
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
