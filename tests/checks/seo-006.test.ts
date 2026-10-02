import { describe, expect, it } from "vitest";
import { seo006 } from "../../src/checks/seo-006.js";
import { makeContext, page } from "../helpers/context.js";

// A brand-new Lovable project, as seen on bngesprod.lovable.app and wwwe.lovable.app.
const LOVABLE_DEFAULTS = `<title>Lovable App</title>
  <meta name="description" content="Lovable Generated Project" />
  <meta name="author" content="Lovable" />
  <meta property="og:title" content="Lovable App" />
  <meta property="og:image" content="https://lovable.dev/opengraph-image-p98pqg.png" />
  <meta name="twitter:site" content="@Lovable" />
  <meta name="twitter:image" content="https://lovable.dev/opengraph-image-p98pqg.png">`;

// The same project after the owner set a title, a description and a preview image: only the X account and
// the author are left (campuscommand.lovable.app).
const ONLY_X_ACCOUNT_LEFT = `<title>Campus Command</title>
  <meta name="description" content="Run your campus operations from one screen." />
  <meta name="author" content="Campus Command Team" />
  <meta property="og:title" content="Campus Command" />
  <meta property="og:image" content="https://campuscommand.example.net/preview.png" />
  <meta name="twitter:site" content="@Lovable" />`;

const run = (head: string, raw = head) => seo006.run(makeContext({ html: page(head), rawHtml: page(raw) }));

describe("SEO-006 default platform metadata", () => {
  it("reports an untouched Lovable project once, as medium, listing everything that is still default", async () => {
    const findings = await run(LOVABLE_DEFAULTS);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "SEO-006", severity: "medium" });
    const evidence = findings[0].evidence;
    for (const part of ['title "Lovable App"', 'description "Lovable Generated Project"', "preview image", '"@Lovable"', 'author "Lovable"']) {
      expect(evidence).toContain(part);
    }
  });

  it("is low when only the X account is left (campuscommand)", async () => {
    const findings = await run(ONLY_X_ACCOUNT_LEFT);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("low");
    expect(findings[0].evidence).toBe('Still default: X account "@Lovable"');
  });

  it("is low when only the author, or only the author and the X account, are left", async () => {
    const author = '<title>Mine</title><meta name="description" content="Mine"><meta name="author" content="Lovable">';
    expect((await run(author))[0].severity).toBe("low");
    expect((await run(author + '<meta name="twitter:site" content="@Lovable">'))[0].severity).toBe("low");
  });

  it.each([
    ["the title", '<title>Lovable App</title>'],
    ["the description", '<meta name="description" content="Lovable Generated Project">'],
    ["the preview image", '<meta property="og:image" content="https://lovable.dev/opengraph-image-abc123.png">'],
  ])("is medium when %s is still default", async (_name, head) => {
    expect((await run(head))[0].severity).toBe("medium");
  });

  it("judges the preview image on the page as served, and the title on the page after JavaScript", async () => {
    // preview bots read the served HTML: the default image there still counts, even if JavaScript replaces it
    const image = '<meta property="og:image" content="https://lovable.dev/opengraph-image-abc123.png">';
    expect(await run('<meta property="og:image" content="https://mine.test/a.png">', image)).toHaveLength(1);
    // a title that JavaScript has already replaced is what visitors and Google see
    expect(await run("<title>My Shop</title>", "<title>Lovable App</title>")).toEqual([]);
  });

  it.each([
    ["a customised site", '<title>Harbor Bakery</title><meta name="description" content="Fresh bread daily"><meta property="og:image" content="https://harborbakery.com/og.png"><meta name="twitter:site" content="@harborbakery"><meta name="author" content="Ana Torres">'],
    ["a page with no head tags", ""],
    ["text that only contains the words", '<title>Lovable App Reviews</title><meta name="description" content="Notes on the Lovable Generated Project template"><meta name="author" content="Lovable Labs">'],
    ["Lovable's other, generated preview images", '<meta property="og:image" content="https://storage.googleapis.com/gpt-engineer-file-uploads/x/social-images/social-1.webp">'],
    ["a different handle", '<meta name="twitter:site" content="@LovableFan">'],
  ])("stays quiet for %s", async (_name, head) => {
    expect(await run(head)).toEqual([]);
  });
});
