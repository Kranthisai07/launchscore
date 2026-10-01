import { describe, expect, it } from "vitest";
import { sec003 } from "../../src/checks/sec-003.js";
import { makeContext } from "../helpers/context.js";

const ALL = {
  "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "strict-transport-security": "max-age=63072000",
};

const without = (...names: string[]): Record<string, string> =>
  Object.fromEntries(Object.entries(ALL).filter(([k]) => !names.includes(k)));

const run = (headers: Record<string, string>, url = "https://shop.test/") =>
  sec003.run(makeContext({ url, headers }));

describe("SEC-003", () => {
  it("is clean when every header is present", async () => {
    expect(await run(ALL)).toEqual([]);
  });

  it("reports a missing CSP as medium, with a plain-English explanation", async () => {
    const findings = await run(without("content-security-policy"), "https://shop.test/");
    // frame-ancestors lived in the CSP, but X-Frame-Options still covers framing
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "SEC-003", severity: "medium" });
    expect(findings[0].title).toContain("Content Security Policy");
    expect(findings[0].title).toContain("browser rule");
  });

  it.each([
    ["x-content-type-options", "X-Content-Type-Options"],
    ["referrer-policy", "Referrer-Policy"],
    ["strict-transport-security", "Strict-Transport-Security"],
  ])("reports missing %s as low", async (header, label) => {
    const findings = await run(without(header));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("low");
    expect(findings[0].title).toContain(label);
  });

  it("accepts frame-ancestors in the CSP instead of X-Frame-Options", async () => {
    expect(await run(without("x-frame-options"))).toEqual([]);
  });

  it("reports missing frame protection when neither is present", async () => {
    const findings = await run({ ...without("x-frame-options"), "content-security-policy": "default-src 'self'" });
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain("frame protection");
  });

  it("does not treat a lookalike directive as frame-ancestors", async () => {
    const findings = await run({
      ...without("x-frame-options"),
      "content-security-policy": "default-src 'self'; x-frame-ancestors 'none'",
    });
    expect(findings).toHaveLength(1);
  });

  it("does not evaluate HSTS on an http page", async () => {
    expect(await run(without("strict-transport-security"), "http://shop.test/")).toEqual([]);
  });

  it("reports one finding per missing header (none sent, https = 5)", async () => {
    const findings = await run({});
    expect(findings.map((f) => f.severity).sort()).toEqual(["low", "low", "low", "low", "medium"]);
    expect(findings.every((f) => f.checkId === "SEC-003")).toBe(true);
  });

  it("uses the final URL to decide about HSTS", async () => {
    const findings = await sec003.run(
      makeContext({ url: "http://shop.test/", finalUrl: "https://shop.test/", headers: without("strict-transport-security") }),
    );
    expect(findings).toHaveLength(1);
  });
});
