import { describe, expect, it } from "vitest";
import { seo004 } from "../../src/checks/seo-004.js";
import { makeContext, page } from "../helpers/context.js";

const robots = (content: string) => `<meta name="robots" content="${content}">`;
const run = (overrides: { raw?: string; rendered?: string; headers?: Record<string, string> }) =>
  seo004.run(
    makeContext({
      rawHtml: page(overrides.raw ?? ""),
      html: page(overrides.rendered ?? overrides.raw ?? ""),
      headers: overrides.headers ?? {},
    }),
  );

describe("SEO-004 flags noindex", () => {
  it("in a meta tag in the served HTML (high)", async () => {
    const findings = await run({ raw: robots("noindex, nofollow") });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "SEO-004", severity: "high" });
    expect(findings[0].evidence).toContain("robots meta tag in your page");
    expect(findings[0].title).toContain("noindex");
  });

  it.each(["noindex", "NOINDEX", " NoIndex , follow", "index,noindex", "none", "noindex,nosnippet"])(
    "for the directive list %j",
    async (content) => {
      expect(await run({ raw: robots(content) })).toHaveLength(1);
    },
  );

  it("when only the rendered page has it (added by JavaScript)", async () => {
    const findings = await run({ raw: "", rendered: robots("noindex") });
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toBe("Found a robots meta tag added by JavaScript");
  });

  it("in an X-Robots-Tag header", async () => {
    const findings = await run({ headers: { "x-robots-tag": "noindex, nofollow" } });
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toBe("Found an X-Robots-Tag header sent by your server");
  });

  it("in a header that names a bot first", async () => {
    expect(await run({ headers: { "x-robots-tag": "googlebot: noindex" } })).toHaveLength(1);
  });

  it("once, listing every place, when meta and header both have it", async () => {
    const findings = await run({ raw: robots("noindex"), headers: { "x-robots-tag": "noindex" } });
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toBe('Found a robots meta tag in your page ("noindex") and an X-Robots-Tag header sent by your server');
  });
});

describe("SEO-004 stays quiet", () => {
  it.each([
    ["no robots tag at all", {}],
    ["index, follow", { raw: robots("index, follow") }],
    ["nofollow only", { raw: robots("nofollow") }],
    ["max-snippet and similar", { raw: robots("max-snippet:-1, max-image-preview:large") }],
    ["a lookalike word", { raw: robots("noindexed-by-mistake") }],
    ["another meta name", { raw: '<meta name="description" content="noindex is a directive">' }],
    ["an unrelated header", { headers: { "x-robots-tag": "all" } }],
    ["noindex in the page text", { raw: "", rendered: "" }],
  ])("%s", async (_name, overrides) => {
    expect(await run(overrides)).toEqual([]);
  });

  it("ignores the word noindex in visible content", async () => {
    const html = page("", "<p>Use noindex to hide a page</p>");
    expect(await seo004.run(makeContext({ rawHtml: html, html }))).toEqual([]);
  });
});
