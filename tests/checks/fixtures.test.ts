import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "../../fixtures/server.js";
import { checks } from "../../src/checks/index.js";
import { buildContext, type PageContext } from "../../src/context.js";
import type { Finding } from "../../src/types.js";

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

const findingsFor = async (id: string, ctx: PageContext): Promise<Finding[]> => {
  const check = checks.find((c) => c.id === id);
  if (!check) throw new Error(`${id} is not registered`);
  return check.run(ctx);
};

describe("registry", () => {
  it("has the five M4 checks, in order", () => {
    expect(checks.map((c) => c.id)).toEqual(["SEC-001", "SEC-003", "SEC-004", "SEO-001", "HYG-003"]);
    expect(checks.every((c) => c.mode === "passive")).toBe(true);
  });
});

describe("good fixture stays clean", () => {
  it.each(["SEC-001", "SEC-003", "SEC-004", "SEO-001", "HYG-003"])("%s finds nothing", async (id) => {
    expect(await findingsFor(id, goodCtx)).toEqual([]);
  });

  it("still carries the decoy publishable keys that SEC-001 must ignore", () => {
    const body = goodCtx.scripts.find((s) => s.url.endsWith("/app.js"))!.body;
    expect(body).toContain("pk_test_");
    expect(body).toContain("sb_publishable_");
    expect(body).toContain("supabase.co");
  });
});

describe("bad fixture triggers exactly the planted findings", () => {
  it("SEC-001: Stripe live key and Supabase service_role JWT, both critical", async () => {
    const findings = await findingsFor("SEC-001", badCtx);
    expect(findings.map((f) => f.severity)).toEqual(["critical", "critical"]);
    expect(findings[0].title).toContain("Stripe");
    expect(findings[1].title).toContain("Supabase admin key");
    expect(findings.every((f) => f.evidence.includes(`${bad.url}/app.js`))).toBe(true);
  });

  it("SEC-003: CSP medium plus three low (HSTS is skipped on http)", async () => {
    const findings = await findingsFor("SEC-003", badCtx);
    expect(findings.map((f) => f.severity)).toEqual(["medium", "low", "low", "low"]);
    expect(findings.some((f) => f.title.includes("Strict-Transport-Security"))).toBe(false);
  });

  it("SEC-004: nothing on localhost (covered by unit tests)", async () => {
    expect(await findingsFor("SEC-004", badCtx)).toEqual([]);
  });

  it("SEO-001: missing title (high) and missing description (medium)", async () => {
    const findings = await findingsFor("SEO-001", badCtx);
    expect(findings.map((f) => f.severity)).toEqual(["high", "medium"]);
  });

  it("HYG-003: lorem ipsum, Your Company, John Doe, example.com email", async () => {
    const findings = await findingsFor("HYG-003", badCtx);
    expect(findings).toHaveLength(4);
    const titles = findings.map((f) => f.title).join("\n");
    for (const expected of ["Lorem ipsum", "Your Company", "John Doe", "email"]) {
      expect(titles).toContain(expected);
    }
    expect(findings.every((f) => f.severity === "medium")).toBe(true);
  });
});
