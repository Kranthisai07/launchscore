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

const TITLE = "Your site is missing some browser security settings";

describe("SEC-003", () => {
  it("is clean when every header is present", async () => {
    expect(await run(ALL)).toEqual([]);
  });

  it("is one low finding per site, whatever is missing, with the plain-English title", async () => {
    const findings = await run({});
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "SEC-003", severity: "low", title: TITLE });
  });

  it("stays low even when only the Content Security Policy is missing (it used to be medium)", async () => {
    // frame-ancestors lived in the CSP, but X-Frame-Options still covers framing
    const findings = await run(without("content-security-policy"));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("low");
    expect(findings[0].evidence).toBe("Not sent by https://shop.test/: Content-Security-Policy");
  });

  it("lists every missing header in the evidence, in a fixed order, with the page address", async () => {
    const [finding] = await run({});
    expect(finding.evidence).toBe(
      "Not sent by https://shop.test/: Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, frame protection (X-Frame-Options), Strict-Transport-Security",
    );
  });

  it.each([
    ["x-content-type-options", "X-Content-Type-Options"],
    ["referrer-policy", "Referrer-Policy"],
    ["strict-transport-security", "Strict-Transport-Security"],
  ])("lists only %s when it is the one missing", async (header, label) => {
    const [finding] = await run(without(header));
    expect(finding.evidence).toBe(`Not sent by https://shop.test/: ${label}`);
  });

  it("explains each missing header in one plain sentence in the fix, and nothing about the ones that are present", async () => {
    const [all] = await run({});
    for (const part of [
      "Content-Security-Policy is a browser rule that limits which scripts may run",
      "X-Content-Type-Options stops browsers from guessing file types",
      "Referrer-Policy controls what other websites learn",
      "X-Frame-Options stops other websites from showing your page hidden inside theirs",
      "Strict-Transport-Security tells browsers to always use the secure version",
    ]) {
      expect(all.fix).toContain(part);
    }
    const [one] = await run(without("referrer-policy"));
    expect(one.fix).toContain("Referrer-Policy controls");
    expect(one.fix).not.toContain("X-Content-Type-Options");
    expect(one.fix).not.toContain("Content-Security-Policy");
  });

  it("accepts frame-ancestors in the CSP instead of X-Frame-Options", async () => {
    expect(await run(without("x-frame-options"))).toEqual([]);
  });

  it("reports missing frame protection when neither is present", async () => {
    const [finding] = await run({ ...without("x-frame-options"), "content-security-policy": "default-src 'self'" });
    expect(finding.evidence).toBe("Not sent by https://shop.test/: frame protection (X-Frame-Options)");
  });

  it("does not treat a lookalike directive as frame-ancestors", async () => {
    const findings = await run({
      ...without("x-frame-options"),
      "content-security-policy": "default-src 'self'; x-frame-ancestors 'none'",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toContain("frame protection");
  });

  it("does not evaluate HSTS on an http page", async () => {
    expect(await run(without("strict-transport-security"), "http://shop.test/")).toEqual([]);
    const [finding] = await run({}, "http://shop.test/");
    expect(finding.evidence).not.toContain("Strict-Transport-Security");
  });

  it("uses the final URL to decide about HSTS", async () => {
    const findings = await sec003.run(
      makeContext({ url: "http://shop.test/", finalUrl: "https://shop.test/", headers: without("strict-transport-security") }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toContain("Strict-Transport-Security");
  });

  describe("on a top-level domain browsers already force onto https (.dev, .app)", () => {
    it.each(["https://solleti.dev/", "https://shop.app/"])("leaves HSTS out of the list on %s, and keeps the other four", async (url) => {
      expect(await run(without("strict-transport-security"), url)).toEqual([]);
      const [finding] = await run({}, url);
      expect(finding.evidence).toBe(
        `Not sent by ${url}: Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, frame protection (X-Frame-Options)`,
      );
      expect(finding.fix).not.toContain("Strict-Transport-Security");
    });

    it("still lists HSTS on .com", async () => {
      const [finding] = await run(without("strict-transport-security"), "https://shop.com/");
      expect(finding.evidence).toBe("Not sent by https://shop.com/: Strict-Transport-Security");
    });
  });
});
