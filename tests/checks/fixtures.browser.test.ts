import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "../../fixtures/server.js";
import { checks } from "../../src/checks/index.js";
import { buildContext, type PageContext } from "../../src/context.js";
import type { Detection, Finding } from "../../src/types.js";

let good: FixtureServer;
let bad: FixtureServer;
let goodCtx: PageContext;
let badCtx: PageContext;

// PERF-001 runs Lighthouse and has its own integration test (tests/lighthouse.browser.test.ts).
const IDS = ["SEC-001", "SEC-002", "SEC-003", "SEC-004", "SEC-005", "SEO-001", "SEO-002", "SEO-003", "SEO-004", "SEO-005", "SEO-006", "A11Y-001", "HYG-001", "HYG-002", "HYG-003", "HYG-004", "HYG-005", "HYG-006"];

beforeAll(async () => {
  [good, bad] = await Promise.all([startFixtureServer("good"), startFixtureServer("bad")]);
  [goodCtx, badCtx] = await Promise.all([buildContext(good.url + "/"), buildContext(bad.url + "/")]);
});

afterAll(async () => {
  await Promise.all([good.close(), bad.close()]);
});

const checkById = (id: string) => {
  const check = checks.find((c) => c.id === id);
  if (!check) throw new Error(`${id} is not registered`);
  return check;
};
const findingsFor = (id: string, ctx: PageContext): Promise<Finding[]> => checkById(id).run(ctx);
const detectionsFor = async (id: string, ctx: PageContext): Promise<Detection[]> => (await checkById(id).detect?.(ctx)) ?? [];
const severities = (findings: Finding[]) => findings.map((f) => f.severity);

describe("registry", () => {
  it("has the nineteen checks", () => {
    expect(checks.map((c) => c.id)).toEqual([...IDS.slice(0, 12), "PERF-001", ...IDS.slice(12)]);
    expect(checks.every((c) => c.mode === "passive")).toBe(true);
  });
});

describe("good fixture stays clean", () => {
  it.each(IDS)("%s finds nothing", async (id) => {
    expect(await findingsFor(id, goodCtx)).toEqual([]);
  });

  it("still carries the decoy publishable keys that SEC-001 must ignore", () => {
    const body = goodCtx.scripts.find((s) => s.url.endsWith("/app.js"))!.body;
    expect(body).toContain("pk_test_");
    expect(body).toContain("sb_publishable_");
    expect(body).toContain("supabase.co");
  });

  it("detects Supabase without reporting a problem", async () => {
    expect(await detectionsFor("SEC-005", goodCtx)).toEqual([
      expect.objectContaining({ checkId: "SEC-005", stack: "supabase", url: "fakeproject.supabase.co" }),
    ]);
  });

  it("serves a real robots.txt and sitemap.xml, and fetches only through ctx.fetch", async () => {
    const robots = await goodCtx.fetch(good.url + "/robots.txt");
    expect(robots).toMatchObject({ status: 200 });
    expect(robots!.body).toContain("Sitemap:");
  });
});

describe("bad fixture triggers exactly the planted findings", () => {
  it("SEC-001: Stripe live key and Supabase service_role JWT, both critical", async () => {
    const findings = await findingsFor("SEC-001", badCtx);
    expect(severities(findings)).toEqual(["critical", "critical"]);
    expect(findings[0].title).toContain("Stripe");
    expect(findings[1].title).toContain("Supabase admin key");
    expect(findings.every((f) => f.evidence.includes(`${bad.url}/app.js`))).toBe(true);
  });

  it("SEC-002: the referenced source map is public (one medium finding, no query string)", async () => {
    const findings = await findingsFor("SEC-002", badCtx);
    expect(severities(findings)).toEqual(["medium"]);
    expect(findings[0].evidence).toBe(`${bad.url}/app.js.map`);
  });

  it("SEC-003: CSP medium plus three low (HSTS is skipped on http)", async () => {
    const findings = await findingsFor("SEC-003", badCtx);
    expect(severities(findings)).toEqual(["medium", "low", "low", "low"]);
    expect(findings.some((f) => f.title.includes("Strict-Transport-Security"))).toBe(false);
  });

  it("SEC-004: nothing on localhost (covered by unit tests)", async () => {
    expect(await findingsFor("SEC-004", badCtx)).toEqual([]);
  });

  it("SEC-005: Supabase is detected but never a finding", async () => {
    expect(await findingsFor("SEC-005", badCtx)).toEqual([]);
    expect((await detectionsFor("SEC-005", badCtx)).map((d) => d.url)).toEqual(["fakeproject.supabase.co"]);
  });

  it("SEO-001: missing title (high) and missing description (medium)", async () => {
    expect(severities(await findingsFor("SEO-001", badCtx))).toEqual(["high", "medium"]);
  });

  it("SEO-002: missing Open Graph tags (medium) and twitter:card (low)", async () => {
    const findings = await findingsFor("SEO-002", badCtx);
    expect(severities(findings)).toEqual(["medium", "low"]);
    expect(findings[0].evidence).toBe("Missing: og:title, og:description, og:image");
  });

  it("SEO-003: no robots.txt and no sitemap.xml, two lows", async () => {
    const findings = await findingsFor("SEO-003", badCtx);
    expect(severities(findings)).toEqual(["low", "low"]);
    expect(findings[0].title).toContain("robots.txt");
    expect(findings[1].title).toContain("sitemap.xml");
  });

  it("SEO-004: noindex, one high finding", async () => {
    const findings = await findingsFor("SEO-004", badCtx);
    expect(severities(findings)).toEqual(["high"]);
    expect(findings[0].evidence).toContain("robots meta tag in your page");
  });

  it("SEO-005: no h1 (low) and a canonical that points at the template address (medium)", async () => {
    const findings = await findingsFor("SEO-005", badCtx);
    expect(severities(findings)).toEqual(["low", "medium"]);
    expect(findings[0].title).toContain("h1");
    expect(findings[1].title).toContain("canonical");
    expect(findings[1].evidence).toContain("yourwebsite.com");
  });

  it("SEO-006: the default @Lovable X account is left, so low", async () => {
    const findings = await findingsFor("SEO-006", badCtx);
    expect(severities(findings)).toEqual(["low"]);
    expect(findings[0].evidence).toBe("Still default: X account \"@Lovable\"");
  });

  it("A11Y-001: image without alt and input without a label (high), faint text (medium)", async () => {
    const findings = await findingsFor("A11Y-001", badCtx);
    expect(findings.map((f) => [f.severity, f.title])).toEqual([
      ["medium", "Some text is too faint to read easily (low color contrast)"],
      ["high", "Some images have no text description (alt text)"],
      ["high", "Some form fields have no label"],
    ]);
    expect(findings.map((f) => f.evidence)).toEqual(["1 element, first: .muted", "1 element, first: img", "1 element, first: input"]);
  });

  it("HYG-001: no privacy link, and the page collects data (form plus Supabase), so high", async () => {
    const findings = await findingsFor("HYG-001", badCtx);
    expect(findings.map((f) => f.severity)).toEqual(["high"]);
    expect(findings[0].evidence).toMatch(/Supabase|email address/);
  });

  it("HYG-002: no terms link, low", async () => {
    expect(severities(await findingsFor("HYG-002", badCtx))).toEqual(["low"]);
  });

  it("HYG-004: the unchanged Vite icon, low", async () => {
    const findings = await findingsFor("HYG-004", badCtx);
    expect(severities(findings)).toEqual(["low"]);
    expect(findings[0].title).toContain("default Vite icon");
    expect(findings[0].evidence).toBe("/vite.svg is the unchanged Vite starter icon");
  });

  it("HYG-005: the script that crashes on load, first-party so medium", async () => {
    const findings = await findingsFor("HYG-005", badCtx);
    expect(severities(findings)).toEqual(["medium"]);
    expect(findings[0].evidence).toContain("undefinedWidget is not defined");
    expect(findings[0].evidence).toContain("(in /app.js)");
  });

  it("HYG-006: the link to a page that does not exist, medium", async () => {
    const findings = await findingsFor("HYG-006", badCtx);
    expect(severities(findings)).toEqual(["medium"]);
    expect(findings[0].evidence).toBe("1 broken link, first: /missing-page");
    expect(badCtx.notTested).toEqual([]); // the fixture says 404, so broken links can be judged
  });

  it("HYG-003: lorem ipsum, Your Company, John Doe, example.com email, and a placeholder author", async () => {
    const findings = await findingsFor("HYG-003", badCtx);
    expect(findings).toHaveLength(5);
    const titles = findings.map((f) => f.title).join("\n");
    for (const expected of ["Lorem ipsum", "Your Company", "John Doe", "email", "title or link-preview tags"]) {
      expect(titles).toContain(expected);
    }
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
  });
});
