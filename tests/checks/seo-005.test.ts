import { describe, expect, it } from "vitest";
import { seo005 } from "../../src/checks/seo-005.js";
import { makeContext, page } from "../helpers/context.js";

const CANONICAL = '<link rel="canonical" href="https://shop.test/">';
const run = (head: string, body: string) => seo005.run(makeContext({ html: page(head, body) }));

describe("SEO-005 headings", () => {
  it("is clean with one h1 and a canonical link", async () => {
    expect(await run(CANONICAL, "<h1>Fresh bread</h1>")).toEqual([]);
  });

  it("reports a page with no h1 as low", async () => {
    const findings = await run(CANONICAL, "<h2>Fresh bread</h2>");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "SEO-005", severity: "low", evidence: "No h1 element found on the page" });
    expect(findings[0].title).toContain("h1");
  });

  it.each([2, 3, 5])("does not flag %i h1 elements (HTML5 and Google allow several)", async (count) => {
    expect(await run(CANONICAL, "<h1>A</h1>".repeat(count))).toEqual([]);
  });

  it("finds an h1 that carries attributes", async () => {
    expect(await run(CANONICAL, '<h1 class="title" id="top">Hi</h1>')).toEqual([]);
  });

  it("does not mistake other tags starting with h1 for a heading", async () => {
    expect(await run(CANONICAL, "<h10>x</h10><h1x>y</h1x>")).toHaveLength(1);
  });

  it.each([
    ["an HTML comment", "<!-- <h1>Hidden</h1> -->"],
    ["a script string", '<script>document.write("<h1>Hi</h1>")</script>'],
    ["a noscript block", "<noscript><h1>Enable JavaScript</h1></noscript>"],
    ["a template", "<template><h1>Later</h1></template>"],
  ])("ignores an h1 inside %s", async (_name, body) => {
    expect(await run(CANONICAL, body)).toHaveLength(1);
  });
});

describe("SEO-005 canonical", () => {
  it("reports a missing canonical link as low", async () => {
    const findings = await run("", "<h1>Hi</h1>");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "low" });
    expect(findings[0].title).toContain("canonical");
  });

  it.each([
    ['rel="canonical alternate"', '<link rel="canonical alternate" href="https://shop.test/">'],
    ["upper case", '<LINK REL="Canonical" HREF="https://shop.test/">'],
    ["single quotes", "<link rel='canonical' href='https://shop.test/'>"],
    ["attributes in the other order", '<link href="https://shop.test/" rel="canonical">'],
  ])("accepts %s", async (_name, tag) => {
    expect(await run(tag, "<h1>Hi</h1>")).toEqual([]);
  });

  it.each([
    ["an empty href", '<link rel="canonical" href="">'],
    ["no href", '<link rel="canonical">'],
    ["a different rel", '<link rel="alternate" href="https://shop.test/">'],
    ["a stylesheet", '<link rel="stylesheet" href="/canonical.css">'],
  ])("reports %s", async (_name, tag) => {
    expect(await run(tag, "<h1>Hi</h1>")).toHaveLength(1);
  });

  it("reports both problems separately", async () => {
    const findings = await run("", "<p>nothing</p>");
    expect(findings.map((f) => f.severity)).toEqual(["low", "low"]);
  });
});

describe("SEO-005 canonical on a different site", () => {
  const runAt = (url: string, canonical: string) =>
    seo005.run(makeContext({ url, html: page(`<link rel="canonical" href="${canonical}">`, "<h1>Hi</h1>") }));

  it("reports a template canonical (yourwebsite.com) as medium, with both hosts in the evidence", async () => {
    const findings = await runAt("https://syntro-astro.vercel.app/", "https://www.yourwebsite.com/");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "SEO-005", severity: "medium" });
    expect(findings[0].evidence).toBe("Canonical is https://www.yourwebsite.com/ but the page is on syntro-astro.vercel.app");
  });

  it.each([
    ["a Lovable preview address on another Lovable site (lovify)", "https://lovify.lovable.app/", "https://preview--retro-terminal-blocks.lovable.app"],
    ["a custom domain pointing at a platform preview", "https://shop.com/", "https://shop-preview.lovable.app/"],
    ["a different custom domain", "https://shop.com/", "https://other-brand.com/"],
    ["example.com", "https://shop.com/", "https://example.com/"],
    ["one platform host pointing at another platform", "https://a.bolt.host/", "https://b.vercel.app/"],
  ])("reports %s", async (_name, url, canonical) => {
    const findings = await runAt(url, canonical);
    expect(findings.map((f) => f.severity)).toEqual(["medium"]);
  });

  it.each([
    ["the page's own address", "https://shop.com/", "https://shop.com/"],
    ["a relative canonical", "https://shop.com/a", "/a"],
    ["www and the bare domain", "https://shop.com/", "https://www.shop.com/"],
    ["the bare domain and www", "https://www.shop.com/", "https://shop.com/"],
    ["a subdomain of the same domain", "https://blog.shop.com/", "https://shop.com/blog"],
    ["a preview copy on bolt.host pointing at the owner's own domain (uds.bolt.host)", "https://uds.bolt.host/", "https://www.ultimatesolutions.in/"],
    ["a preview copy on lovable.app pointing at a custom domain", "https://app.lovable.app/", "https://myapp.com/"],
    ["the same Lovable address", "https://myapp.lovable.app/", "https://myapp.lovable.app/"],
  ])("stays quiet for %s", async (_name, url, canonical) => {
    expect(await runAt(url, canonical)).toEqual([]);
  });

  it("still reports a missing canonical on its own", async () => {
    const findings = await run("", "<h1>Hi</h1>");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("low");
  });
});
