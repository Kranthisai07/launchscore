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
