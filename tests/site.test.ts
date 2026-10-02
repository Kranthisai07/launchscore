import { describe, expect, it } from "vitest";
import { HOSTING_SUFFIXES, isUnderHostingSuffix } from "../src/data/hosting-suffixes.js";
import { HSTS_PRELOADED_TLDS, isHstsPreloadedTld } from "../src/data/hsts-preloaded-tlds.js";
import { isSameSite } from "../src/site.js";

describe("isSameSite", () => {
  it.each([
    ["supermemory.ai", "api.supermemory.ai"],
    ["api.supermemory.ai", "supermemory.ai"],
    ["shop.test", "cdn.shop.test"],
    ["www.shop.co.uk", "static.shop.co.uk"],
    ["SHOP.com", "cdn.shop.com."],
    ["127.0.0.1", "127.0.0.1"],
    ["myapp.lovable.app", "myapp.lovable.app"],
  ])("%s and %s are the same site", (a, b) => {
    expect(isSameSite(a, b)).toBe(true);
  });

  it.each([
    ["myapp.lovable.app", "cdn.lovable.app"],
    ["myapp.vercel.app", "other.vercel.app"],
    ["a.github.io", "b.github.io"],
    ["solleti.dev", "cdn.segment.com"],
    ["supermemory.ai", "cdn.segment.com"],
    ["shop.co.uk", "other.co.uk"],
    ["127.0.0.1", "10.0.0.1"],
    ["localhost", "shop.test"],
    ["shop.test", "shop.test.evil.com"],
  ])("%s and %s are different sites", (a, b) => {
    expect(isSameSite(a, b)).toBe(false);
  });
});

describe("hosting suffixes", () => {
  it.each(["lovable.app", "vercel.app", "netlify.app", "github.io", "pages.dev", "streamlit.app", "onrender.com", "replit.app"])(
    "includes %s",
    (suffix) => expect(HOSTING_SUFFIXES.has(suffix)).toBe(true),
  );

  it("matches names under a suffix and the suffix itself, not lookalikes", () => {
    expect(isUnderHostingSuffix("myapp.lovable.app")).toBe(true);
    expect(isUnderHostingSuffix("a.b.vercel.app")).toBe(true);
    expect(isUnderHostingSuffix("lovable.app")).toBe(true);
    expect(isUnderHostingSuffix("notlovable.app")).toBe(false);
    expect(isUnderHostingSuffix("lovable.app.evil.com")).toBe(false);
    expect(isUnderHostingSuffix("supermemory.ai")).toBe(false);
  });

  it("only lists lowercase names without leading dots", () => {
    for (const s of HOSTING_SUFFIXES) expect(s).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
  });
});

describe("HSTS preloaded TLDs", () => {
  it("has the 51 whole-TLD entries of the Chromium list", () => {
    expect(HSTS_PRELOADED_TLDS.size).toBe(51);
    for (const tld of HSTS_PRELOADED_TLDS) expect(tld).toMatch(/^[a-z0-9-]+$/);
  });

  it.each(["solleti.dev", "www.tasteskill.dev", "myapp.streamlit.app", "SHOP.APP", "shop.dev."])("%s is covered", (host) => {
    expect(isHstsPreloadedTld(host)).toBe(true);
  });

  it.each(["shop.com", "shop.io", "shop.net", "supermemory.ai", "localhost", "127.0.0.1", "[::1]", "dev", "", "app.shop.com"])(
    "%s is not covered",
    (host) => {
      expect(isHstsPreloadedTld(host)).toBe(false);
    },
  );
});
