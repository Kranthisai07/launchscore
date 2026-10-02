import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "../fixtures/server.js";
import { buildContext, MAX_SCRIPTS, MAX_SCRIPT_BYTES, MAX_TOTAL_SCRIPT_BYTES, SKIP_REASON, type PageContext } from "../src/context.js";
import { MANY, scriptRoutes, SIZED } from "./helpers/script-pages.js";

let good: FixtureServer;
let bad: FixtureServer;
let custom: FixtureServer;
let goodCtx: PageContext;
let badCtx: PageContext;

beforeAll(async () => {
  [good, bad, custom] = await Promise.all([startFixtureServer("good"), startFixtureServer("bad"), startFixtureServer("good", { extraRoutes: scriptRoutes() })]);
  [goodCtx, badCtx] = await Promise.all([buildContext(good.url + "/"), buildContext(bad.url + "/")]);
});

afterAll(async () => {
  await Promise.all([good.close(), bad.close(), custom.close()]);
});

describe("buildContext on the good fixture", () => {
  it("records the response", () => {
    expect(goodCtx.status).toBe(200);
    expect(goodCtx.finalUrl).toBe(good.url + "/");
    for (const name of [
      "content-security-policy",
      "strict-transport-security",
      "x-frame-options",
      "x-content-type-options",
      "referrer-policy",
    ]) {
      expect(goodCtx.headers[name], name).toBeTruthy();
    }
  });

  it("has both rawHtml (as served) and html (rendered DOM)", () => {
    expect(goodCtx.rawHtml).toContain("<h1>Fresh sourdough");
    expect(goodCtx.rawHtml).toContain(`href="${good.url}/"`); // ORIGIN already filled in by the server
    expect(goodCtx.html).toContain("<h1>Fresh sourdough");
    // The script sets data-ready on <html> after load: only the rendered DOM has it.
    expect(goodCtx.html).toContain("data-ready");
    expect(goodCtx.rawHtml).not.toContain("data-ready");
  });

  it("captures the bundle with placeholders filled and reports no skipped scripts", () => {
    const app = goodCtx.scripts.find((s) => s.url.endsWith("/app.js"));
    expect(app).toBeDefined();
    expect(app!.body).toContain("pk_test_");
    expect(app!.body).not.toContain("{{");
    expect(goodCtx.skippedScripts).toEqual([]);
  });

  it("has no console errors and collects absolute internal links", () => {
    expect(goodCtx.consoleErrors).toEqual([]);
    expect(goodCtx.links).toContain(good.url + "/privacy.html");
    expect(goodCtx.links).toContain(good.url + "/terms.html");
  });
});

describe("buildContext on the bad fixture", () => {
  it("sees no security headers", () => {
    expect(badCtx.status).toBe(200);
    expect(badCtx.headers["content-security-policy"]).toBeUndefined();
    expect(badCtx.headers["strict-transport-security"]).toBeUndefined();
  });

  it("captures the large script and the planted console error", () => {
    const big = badCtx.scripts.find((s) => s.url.endsWith("/big.js"));
    expect(big).toBeDefined();
    expect(big!.body.length).toBeGreaterThan(1_000_000);
    const crash = badCtx.consoleErrors.find((e) => e.text.includes("undefinedWidget"));
    expect(crash).toBeDefined();
    expect(crash!.url).toBe(bad.url + "/app.js"); // the file it came from is recorded
  });

  it("collects the broken internal link", () => {
    expect(badCtx.links).toContain(bad.url + "/missing-page");
  });
});

describe("script limits", () => {
  it("are 5 MB per file, 25 MB in total, 500 files", () => {
    expect([MAX_SCRIPT_BYTES, MAX_TOTAL_SCRIPT_BYTES, MAX_SCRIPTS]).toEqual([5 * 1024 * 1024, 25 * 1024 * 1024, 500]);
  });

  it("records a script over the per-file limit as skipped, not truncated", async () => {
    const ctx = await buildContext(good.url + "/", { maxScriptBytes: 10 });
    expect(ctx.scripts).toEqual([]);
    expect(ctx.skippedScripts).toEqual([{ url: good.url + "/app.js", reason: SKIP_REASON.tooLarge }]);
  });

  it("records scripts over the file limit as skipped", async () => {
    const ctx = await buildContext(good.url + "/", { maxScripts: 0 });
    expect(ctx.scripts).toEqual([]);
    expect(ctx.skippedScripts).toEqual([{ url: good.url + "/app.js", reason: "over the file limit" }]);
  });

  it(`reads all ${MANY} small scripts: the old limit of 100 files no longer applies`, async () => {
    const ctx = await buildContext(custom.url + "/many");
    expect(ctx.scripts).toHaveLength(MANY);
    expect(ctx.skippedScripts).toEqual([]);
    expect(ctx.scripts.some((s) => s.url.endsWith("/many/149.js") && s.body.includes("__many149"))).toBe(true);
  });

  it("stops at a lower file limit and says how many it left", async () => {
    const ctx = await buildContext(custom.url + "/many", { maxScripts: 100 });
    expect(ctx.scripts).toHaveLength(100);
    expect(ctx.skippedScripts).toHaveLength(MANY - 100);
    expect(new Set(ctx.skippedScripts.map((s) => s.reason))).toEqual(new Set(["over the file limit"]));
  });

  it("stops when the total size limit is reached, and reports it", async () => {
    // five scripts of about 1.1 KB each: a 3 KB budget fits two, then the budget is spent
    const ctx = await buildContext(custom.url + "/sized", { maxTotalScriptBytes: 3000 });
    expect(ctx.scripts).toHaveLength(2);
    expect(ctx.skippedScripts).toHaveLength(SIZED - 2);
    expect(new Set(ctx.skippedScripts.map((s) => s.reason))).toEqual(new Set(["over the size limit"]));
  });

  it("does not report a size limit when everything fits", async () => {
    const ctx = await buildContext(custom.url + "/sized", { maxTotalScriptBytes: 100_000 });
    expect(ctx.scripts).toHaveLength(SIZED);
    expect(ctx.skippedScripts).toEqual([]);
  });

  it("applies the per-file limit before the total, so a huge file does not use up the budget", async () => {
    const ctx = await buildContext(custom.url + "/sized", { maxScriptBytes: 500, maxTotalScriptBytes: 100_000 });
    expect(ctx.scripts).toEqual([]);
    expect(new Set(ctx.skippedScripts.map((s) => s.reason))).toEqual(new Set(["too large"]));
  });
});

describe("a script address that redirects", () => {
  it("is neither read nor counted as skipped: the file it points to is the one scanned", async () => {
    const ctx = await buildContext(custom.url + "/redirect-page");
    expect(ctx.skippedScripts).toEqual([]);
    expect(ctx.scripts.map((s) => new URL(s.url).pathname)).toEqual(["/target.js"]);
    expect(ctx.scripts[0].body).toContain("__target");
  });
});

describe("a page that renders but never fires the load event", () => {
  it("is scanned anyway, after waiting only a bounded time for load and for the network", async () => {
    const started = Date.now();
    const ctx = await buildContext(custom.url + "/never-loads", { loadTimeoutMs: 1_000, idleTimeoutMs: 500 });
    expect(ctx.status).toBe(200);
    expect(ctx.html).toContain("<h1>Still here</h1>");
    expect(ctx.rawHtml).toContain("<h1>Still here</h1>");
    expect(Date.now() - started).toBeLessThan(15_000); // it did not wait out the old 30 s navigation limit
  });

  it("still fails clearly when the page itself cannot be reached", async () => {
    await expect(buildContext("http://127.0.0.1:1/", { navigationTimeoutMs: 2_000 })).rejects.toThrow(/Could not load/);
  });
});

describe("navigation failures", () => {
  it("throws a plain-English error when the page cannot be reached", async () => {
    await expect(buildContext("http://127.0.0.1:1/")).rejects.toThrow(/Could not load/);
  });
});

describe("axe results on the page context", () => {
  it("good fixture: axe ran during the same load and found nothing (even with a strict CSP)", () => {
    expect(goodCtx.axe).toEqual({ violations: [] });
  });

  it("bad fixture: axe found the planted problems, with counts and a selector but no HTML", () => {
    expect("violations" in badCtx.axe ? badCtx.axe.violations.map((v) => [v.id, v.impact, v.nodes, v.firstTarget]) : []).toEqual([
      ["color-contrast", "serious", 1, ".muted"],
      ["document-title", "serious", 1, "html"],
      ["image-alt", "critical", 1, "img"],
      ["label", "critical", 1, "input"],
    ]);
  });
});
