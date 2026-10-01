import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "../fixtures/server.js";
import { buildContext, type PageContext } from "../src/context.js";

let good: FixtureServer;
let bad: FixtureServer;
let goodCtx: PageContext;
let badCtx: PageContext;

beforeAll(async () => {
  [good, bad] = await Promise.all([startFixtureServer("good"), startFixtureServer("bad")]);
  [goodCtx, badCtx] = await Promise.all([buildContext(good.url + "/"), buildContext(bad.url + "/")]);
});

afterAll(async () => {
  await Promise.all([good.close(), bad.close()]);
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

describe("script caps", () => {
  it("records scripts over the byte cap as skipped, not truncated", async () => {
    const ctx = await buildContext(good.url + "/", { maxScriptBytes: 10 });
    expect(ctx.scripts).toEqual([]);
    expect(ctx.skippedScripts).toEqual([{ url: good.url + "/app.js", reason: "too large" }]);
  });

  it("records scripts over the count cap as skipped", async () => {
    const ctx = await buildContext(good.url + "/", { maxScripts: 0 });
    expect(ctx.scripts).toEqual([]);
    expect(ctx.skippedScripts).toEqual([{ url: good.url + "/app.js", reason: "over script limit" }]);
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
