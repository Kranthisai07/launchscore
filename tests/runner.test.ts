import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "../fixtures/server.js";
import type { PageContext } from "../src/context.js";
import { MAX_CONCURRENT_CHECKS, runScan } from "../src/runner.js";
import { checks as registry } from "../src/checks/index.js";
import type { Check, Finding } from "../src/types.js";

// Test-only checks. Nothing here ships in the registry.
const loremCheck: Check = {
  id: "TEST-001",
  title: "Placeholder text",
  category: "hygiene",
  mode: "passive",
  async run(ctx) {
    return /lorem ipsum/i.test(ctx.html)
      ? [
          {
            checkId: "TEST-001",
            severity: "low",
            title: "Placeholder text found",
            why: "Visitors will see unfinished copy.",
            evidence: "lorem ipsum",
            fix: "Replace it with real text.",
          },
        ]
      : [];
  },
};

const makeActive = (ran: string[]): Check => ({
  id: "TEST-ACTIVE",
  title: "Active probe",
  category: "security",
  mode: "active",
  async run() {
    ran.push("TEST-ACTIVE");
    return [];
  },
});

let good: FixtureServer;
let bad: FixtureServer;

beforeAll(async () => {
  [good, bad] = await Promise.all([
    startFixtureServer("good", {
      extraRoutes: {
        // Test-only: same server, different hostname, so the final host differs from the requested one.
        "/redirect-external": (_req, res, origin) => {
          res.writeHead(302, { Location: origin.replace("127.0.0.1", "localhost") + "/" }).end();
        },
      },
    }),
    startFixtureServer("bad"),
  ]);
});

afterAll(async () => {
  await Promise.all([good.close(), bad.close()]);
});

describe("runScan with the real registry (Lighthouse skipped)", () => {
  const SKIPPED = { checkId: "PERF-001", title: "Performance", reason: "skipped (--no-perf)" };

  it("runs thirteen checks: good is clean, bad has 23 findings and a score", async () => {
    expect(registry.map((c) => c.id)).toEqual([
      "SEC-001", "SEC-002", "SEC-003", "SEC-004", "SEC-005", "SEO-001", "SEO-002", "SEO-003", "SEO-004", "SEO-005",
      "A11Y-001", "PERF-001", "HYG-003",
    ]);

    const onGood = await runScan(good.url + "/", { skipPerformance: true });
    expect(onGood).toMatchObject({ findings: [], notTested: [SKIPPED], checksRun: 12, verified: false });
    expect(onGood.detected.map((d) => [d.stack, d.url])).toEqual([["supabase", "fakeproject.supabase.co"]]);
    expect(onGood.score).toMatchObject({ score: 100, verdict: "ALMOST READY", partial: true }); // performance untested

    const onBad = await runScan(bad.url + "/", { skipPerformance: true });
    expect(onBad).toMatchObject({ notTested: [SKIPPED], checksRun: 12 });
    expect(onBad.detected.map((d) => d.stack)).toEqual(["supabase"]);
    const counts: Record<string, number> = {};
    for (const f of onBad.findings) counts[f.checkId] = (counts[f.checkId] ?? 0) + 1;
    expect(counts).toEqual({
      "SEC-001": 2, "SEC-002": 1, "SEC-003": 4, "SEO-001": 2, "SEO-002": 2, "SEO-003": 2, "SEO-004": 1, "SEO-005": 2,
      "A11Y-001": 3, "HYG-003": 4,
    });
    expect(onBad.findings).toHaveLength(23);
    // security 0, seo 0, accessibility 25 (two high, one medium), hygiene 40: (0 + 0 + 25*15 + 40*15) / 85 = 11.5
    expect(onBad.score).toMatchObject({ score: 11, verdict: "BLOCKED: CRITICAL ISSUE", partial: true });
    expect(onBad.score.categories.map((c) => c.score)).toEqual([0, 0, 25, null, 40]);
  });
});

describe("runScan with test checks", () => {
  it("runs a passive check: finding on bad, silent on good", async () => {
    const onBad = await runScan(bad.url + "/", { checks: [loremCheck] });
    expect(onBad.checksRun).toBe(1);
    expect(onBad.findings.map((f) => f.checkId)).toEqual(["TEST-001"]);
    const onGood = await runScan(good.url + "/", { checks: [loremCheck] });
    expect(onGood.findings).toEqual([]);
  });

  it("reports the final URL and a timestamp", async () => {
    const result = await runScan(good.url + "/", { skipPerformance: true });
    expect(result.url).toBe(good.url + "/");
    expect(Number.isNaN(Date.parse(result.scannedAt))).toBe(false);
  });

  it("collects detections from detect()", async () => {
    const detector: Check = {
      id: "TEST-DETECT",
      title: "Stack detector",
      category: "security",
      mode: "passive",
      run: async () => [],
      detect: async (ctx) => [{ checkId: "TEST-DETECT", stack: "fixture", url: ctx.finalUrl, note: "Detected." }],
    };
    const result = await runScan(good.url + "/", { checks: [detector] });
    expect(result.findings).toEqual([]);
    expect(result.detected).toEqual([
      { checkId: "TEST-DETECT", stack: "fixture", url: good.url + "/", note: "Detected." },
    ]);
  });

  it("keeps results in registry order", async () => {
    const make = (id: string, delay: number): Check => ({
      id,
      title: id,
      category: "hygiene",
      mode: "passive",
      async run() {
        await new Promise((r) => setTimeout(r, delay));
        return [{ checkId: id, severity: "low", title: id, why: "w", evidence: "", fix: "f" }];
      },
    });
    const result = await runScan(good.url + "/", { checks: [make("A", 60), make("B", 1), make("C", 30)] });
    expect(result.findings.map((f) => f.checkId)).toEqual(["A", "B", "C"]);
  });
});

describe("concurrency", () => {
  it("never runs more than 5 checks at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const slow = (n: number): Check => ({
      id: `SLOW-${n}`,
      title: `Slow ${n}`,
      category: "hygiene",
      mode: "passive",
      async run() {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 25));
        inFlight--;
        return [];
      },
    });
    const result = await runScan(good.url + "/", { checks: Array.from({ length: 12 }, (_, i) => slow(i)) });
    expect(result.checksRun).toBe(12);
    expect(peak).toBe(MAX_CONCURRENT_CHECKS);
  });
});

describe("failures", () => {
  it("puts a crashed check in notTested without failing the scan", async () => {
    const crashing: Check = {
      id: "TEST-CRASH",
      title: "Crashes",
      category: "hygiene",
      mode: "passive",
      run: async () => {
        throw new Error("boom\nstack line");
      },
    };
    const result = await runScan(good.url + "/", { checks: [crashing, loremCheck] });
    expect(result.findings).toEqual([]);
    expect(result.notTested).toEqual([
      { checkId: "TEST-CRASH", title: "Crashes", reason: "check failed: boom" },
    ]);
  });
});

describe("active-check gating", () => {
  it("runs active checks on a verified host", async () => {
    const ran: string[] = [];
    const result = await runScan(good.url + "/", { checks: [makeActive(ran)] });
    expect(ran).toEqual(["TEST-ACTIVE"]);
    expect(result.notTested).toEqual([]);
  });

  it("skips active checks when the host is not verified", async () => {
    const ran: string[] = [];
    const result = await runScan(good.url + "/", { checks: [makeActive(ran)], verify: async () => false });
    expect(ran).toEqual([]);
    expect(result.notTested).toEqual([
      { checkId: "TEST-ACTIVE", title: "Active probe", reason: "domain not verified" },
    ]);
  });

  it("skips active checks after a redirect to a different domain, even if verify would pass", async () => {
    const ran: string[] = [];
    const result = await runScan(good.url + "/redirect-external", {
      checks: [makeActive(ran), loremCheck],
      verify: async () => true,
    });
    expect(new URL(result.url).hostname).toBe("localhost");
    expect(ran).toEqual([]);
    expect(result.notTested).toEqual([
      { checkId: "TEST-ACTIVE", title: "Active probe", reason: "redirected to a different domain" },
    ]);
    expect(result.checksRun).toBe(1); // passive checks still run
  });
});

describe("skipped scripts", () => {
  it("adds a 'scripts not scanned' entry so a skipped bundle never reads as clean", async () => {
    const result = await runScan(good.url + "/", { context: { maxScriptBytes: 10 }, skipPerformance: true });
    expect(result.notTested).toEqual([
      { checkId: "PERF-001", title: "Performance", reason: "skipped (--no-perf)" },
      { checkId: "CONTEXT", title: "JavaScript files not scanned", reason: "scripts not scanned: 1 file(s)" },
    ]);
  });
});

const passive = (id: string, category: Check["category"], run?: Check["run"]): Check => ({
  id,
  title: id,
  category,
  mode: "passive",
  run: run ?? (async () => []),
});

const fiveCategories = (): Check[] => [
  passive("T-SEC", "security"),
  passive("T-SEO", "seo"),
  passive("T-A11Y", "accessibility"),
  passive("T-PERF", "performance"),
  passive("T-HYG", "hygiene"),
];

describe("scoring in the runner", () => {
  it("is READY TO LAUNCH only when every category was tested and the scan was complete", async () => {
    const result = await runScan(good.url + "/", { checks: fiveCategories() });
    expect(result.score).toMatchObject({ score: 100, verdict: "READY TO LAUNCH", partial: false });
  });

  it("caps the verdict and marks the scan partial when a script was skipped", async () => {
    const result = await runScan(good.url + "/", { checks: fiveCategories(), context: { maxScriptBytes: 10 } });
    expect(result.score).toMatchObject({ score: 100, verdict: "ALMOST READY", partial: true });
  });

  it("caps the verdict when a check crashed, but the category still counts as tested if another check in it ran", async () => {
    const crash = passive("T-SEC-CRASH", "security", async () => {
      throw new Error("boom");
    });
    const result = await runScan(good.url + "/", { checks: [...fiveCategories(), crash] });
    expect(result.score.categories.find((c) => c.name === "security")).toEqual({ name: "security", score: 100, tested: true });
    expect(result.score).toMatchObject({ verdict: "ALMOST READY", partial: true });
  });

  it("leaves a category untested when its only check crashed", async () => {
    const crash = passive("T-SEO", "seo", async () => {
      throw new Error("boom");
    });
    const result = await runScan(good.url + "/", { checks: [crash, passive("T-SEC", "security")] });
    expect(result.score.categories.find((c) => c.name === "seo")).toEqual({ name: "seo", score: null, tested: false });
  });

  it("scores findings through the category of the check that produced them", async () => {
    const noisy = passive("T-HYG-F", "hygiene", async () => [
      { checkId: "T-HYG-F", severity: "high", title: "t", why: "w", evidence: "", fix: "f" },
    ]);
    const result = await runScan(good.url + "/", { checks: [...fiveCategories(), noisy] });
    expect(result.score.categories.find((c) => c.name === "hygiene")?.score).toBe(70);
    expect(result.score.categories.find((c) => c.name === "security")?.score).toBe(100);
  });

  it("an unverified domain does not cap the verdict or make the scan partial, and verified stays false", async () => {
    const ran: string[] = [];
    const active = { ...makeActive(ran), category: "security" as const };
    const result = await runScan(good.url + "/", { checks: [...fiveCategories(), active], verify: async () => false });
    expect(ran).toEqual([]);
    expect(result.verified).toBe(false);
    expect(result.score).toMatchObject({ score: 100, verdict: "READY TO LAUNCH", partial: false });
    expect(result.notTested).toHaveLength(1); // listed as not tested, but not a cap
  });

  it("sets verified when an active check ran", async () => {
    const ran: string[] = [];
    const result = await runScan(good.url + "/", { checks: [...fiveCategories(), makeActive(ran)] });
    expect(ran).toEqual(["TEST-ACTIVE"]);
    expect(result.verified).toBe(true);
  });

  it("is not verified after a redirect to a different domain", async () => {
    const ran: string[] = [];
    const result = await runScan(good.url + "/redirect-external", { checks: [makeActive(ran)], verify: async () => true });
    expect(result.verified).toBe(false);
  });
});

describe("notTested entries added by checks", () => {
  it("are reported by the runner and do not by themselves make the scan partial", async () => {
    const adds: Check = {
      id: "T-ADD",
      title: "Adds an entry",
      category: "security",
      mode: "passive",
      async run(ctx) {
        ctx.notTested.push({ checkId: "T-ADD", title: "Adds an entry", reason: "3 things not checked (limit 20)" });
        return [];
      },
    };
    const result = await runScan(good.url + "/", { checks: [...fiveCategories(), adds] });
    expect(result.notTested).toEqual([{ checkId: "T-ADD", title: "Adds an entry", reason: "3 things not checked (limit 20)" }]);
    expect(result.score).toMatchObject({ verdict: "READY TO LAUNCH", partial: false });
  });
});

describe("performance checks in the runner", () => {
  const perf = (id: string, body: (ctx: PageContext) => Promise<Finding[]>): Check => ({
    id, title: id, category: "performance", mode: "passive", run: body,
  });

  it("runs after every other check has finished, and alone", async () => {
    let quickInFlight = 0;
    let quickDone = 0;
    let perfSawInFlight = -1;
    let perfSawDone = -1;
    const quick = (n: number): Check =>
      passive(`Q-${n}`, "security", async () => {
        quickInFlight++;
        await new Promise((r) => setTimeout(r, 30));
        quickInFlight--;
        quickDone++;
        return [];
      });
    const slow = perf("P-1", async () => {
      perfSawInFlight = quickInFlight;
      perfSawDone = quickDone;
      return [];
    });
    // The slow check is listed first, but must still run last.
    await runScan(good.url + "/", { checks: [slow, quick(1), quick(2), quick(3)] });
    expect(perfSawInFlight).toBe(0);
    expect(perfSawDone).toBe(3);
  });

  it("runs several performance checks one at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    const make = (id: string) =>
      perf(id, async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight--;
        return [];
      });
    await runScan(good.url + "/", { checks: [make("P-1"), make("P-2"), make("P-3")] });
    expect(peak).toBe(1);
  });

  it("uses the score a check puts in ctx.categoryScores, and ignores that category's findings for deductions", async () => {
    const measured = perf("P-1", async (ctx) => {
      ctx.categoryScores.performance = 62;
      return [{ checkId: "P-1", severity: "high", title: "t", why: "w", evidence: "", fix: "f" }];
    });
    const result = await runScan(good.url + "/", { checks: [...fiveCategories().filter((c) => c.category !== "performance"), measured] });
    expect(result.score.categories.find((c) => c.name === "performance")).toEqual({ name: "performance", score: 62, tested: true });
    expect(result.findings).toHaveLength(1); // still reported, just not deducted
  });

  it("leaves performance untested, and records why, when the check fails", async () => {
    const failing = perf("P-1", async () => {
      throw new Error("Lighthouse timed out after 60 s");
    });
    const result = await runScan(good.url + "/", { checks: [...fiveCategories().filter((c) => c.category !== "performance"), failing] });
    expect(result.score.categories.find((c) => c.name === "performance")).toEqual({ name: "performance", score: null, tested: false });
    expect(result.notTested).toEqual([{ checkId: "P-1", title: "P-1", reason: "check failed: Lighthouse timed out after 60 s" }]);
    expect(result.score.partial).toBe(true);
  });

  it("skips performance checks when asked, records that, and reports a status message otherwise", async () => {
    const ran: string[] = [];
    const measured = perf("P-1", async () => {
      ran.push("P-1");
      return [];
    });
    const skipped = await runScan(good.url + "/", { checks: [measured], skipPerformance: true });
    expect(ran).toEqual([]);
    expect(skipped.notTested).toEqual([{ checkId: "P-1", title: "P-1", reason: "skipped (--no-perf)" }]);

    const messages: string[] = [];
    await runScan(good.url + "/", { checks: [passive("Q", "security"), measured], onStatus: (m) => messages.push(m) });
    expect(ran).toEqual(["P-1"]);
    expect(messages).toEqual([expect.stringContaining("Lighthouse")]);

    const quiet: string[] = [];
    await runScan(good.url + "/", { checks: [passive("Q", "security")], onStatus: (m) => quiet.push(m) });
    expect(quiet).toEqual([]);
  });
});
