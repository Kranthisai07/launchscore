import { describe, expect, it } from "vitest";
import { seo001 } from "../../src/checks/seo-001.js";
import { makeContext, page } from "../helpers/context.js";

const GOOD_TITLE = "Harbor Bakery | Fresh sourdough";
const GOOD_DESC = "Small-batch sourdough baked every morning and delivered across Portland.";

const head = (title: string | null, desc: string | null): string =>
  (title === null ? "" : `<title>${title}</title>`) +
  (desc === null ? "" : `<meta name="description" content="${desc}">`);

const run = (html: string, rawHtml = html) => seo001.run(makeContext({ html, rawHtml }));
const summary = (findings: { severity: string; title: string }[]) => findings.map((f) => f.severity);

describe("SEO-001", () => {
  it("is clean with a sane title and description", async () => {
    expect(await run(page(head(GOOD_TITLE, GOOD_DESC)))).toEqual([]);
  });

  it("reports a missing title as high and a missing description as medium", async () => {
    expect(summary(await run(page("")))).toEqual(["high", "medium"]);
  });

  it("treats an empty or whitespace-only title or description as missing", async () => {
    expect(summary(await run(page(head("   ", ""))))).toEqual(["high", "medium"]);
  });

  it.each([
    [9, "low"],
    [10, null],
    [70, null],
    [71, "low"],
  ])("title of %i characters", async (length, severity) => {
    const findings = await run(page(head("t".repeat(length), GOOD_DESC)));
    expect(summary(findings)).toEqual(severity ? [severity] : []);
  });

  it.each([
    [49, "low"],
    [50, null],
    [160, null],
    [161, "low"],
  ])("description of %i characters", async (length, severity) => {
    const findings = await run(page(head(GOOD_TITLE, "d".repeat(length))));
    expect(summary(findings)).toEqual(severity ? [severity] : []);
  });

  it("accepts a title and description added by JavaScript (rendered HTML only)", async () => {
    const rendered = page(head(GOOD_TITLE, GOOD_DESC));
    expect(await run(rendered, page(""))).toEqual([]);
  });

  it("ignores an SVG <title> in the body", async () => {
    const html = page("", "<svg><title>Logo</title></svg>");
    expect((await run(html))[0].title).toBe("Your page has no title");
  });

  it("finds the description whatever the attribute order or quoting", async () => {
    const html = page(`<title>${GOOD_TITLE}</title><meta content='${GOOD_DESC}' name='Description'>`);
    expect(await run(html)).toEqual([]);
  });

  it("decodes entities before measuring", async () => {
    const html = page(head("Tom &amp; Jerry&#39;s Diner", GOOD_DESC));
    expect(await run(html)).toEqual([]);
  });

  it("uses plain English and reports as SEO-001", async () => {
    const [finding] = await run(page(""));
    expect(finding).toMatchObject({ checkId: "SEO-001", severity: "high" });
    expect(finding.fix).toMatch(/title/i);
  });
});
