import { describe, expect, it } from "vitest";
import { seo002 } from "../../src/checks/seo-002.js";
import { makeContext, page } from "../helpers/context.js";

const og = (property: string, content: string) => `<meta property="${property}" content="${content}">`;
const FULL =
  og("og:title", "Harbor Bakery") +
  og("og:description", "Fresh bread daily.") +
  og("og:image", "https://harbor.test/og.png") +
  '<meta name="twitter:card" content="summary_large_image">';

const run = (rawHead: string, renderedHead = rawHead) =>
  seo002.run(makeContext({ rawHtml: page(rawHead), html: page(renderedHead) }));
const severities = (f: { severity: string }[]) => f.map((x) => x.severity);

describe("SEO-002", () => {
  it("is clean with every tag present in the served HTML", async () => {
    expect(await run(FULL)).toEqual([]);
  });

  it("reports missing Open Graph tags as one medium finding listing which are missing", async () => {
    const findings = await run(og("og:title", "Harbor") + '<meta name="twitter:card" content="summary">');
    expect(severities(findings)).toEqual(["medium"]);
    expect(findings[0].evidence).toBe("Missing: og:description, og:image");
    expect(findings[0].title).toContain("Open Graph");
  });

  it("reports every missing tag at once (medium for og, low for twitter:card)", async () => {
    const findings = await run("");
    expect(severities(findings)).toEqual(["medium", "low"]);
    expect(findings[0].evidence).toBe("Missing: og:title, og:description, og:image");
    expect(findings[1].evidence).toBe("Missing: twitter:card");
  });

  it("reports a missing twitter:card alone as low", async () => {
    const head = FULL.replace(/<meta name="twitter:card"[^>]*>/, "");
    expect(severities(await run(head))).toEqual(["low"]);
  });

  it("treats empty content as missing", async () => {
    const findings = await run(og("og:title", "") + og("og:description", "  ") + og("og:image", "https://a.test/i.png"));
    expect(findings[0].evidence).toBe("Missing: og:title, og:description");
  });

  it("accepts twitter:card written with property instead of name", async () => {
    const head = FULL.replace('name="twitter:card"', 'property="twitter:card"');
    expect(await run(head)).toEqual([]);
  });

  describe("tags added by JavaScript (present in rendered HTML only)", () => {
    it("reports one medium finding with the plain-English explanation, not a 'missing' finding", async () => {
      const findings = await run("", FULL);
      expect(severities(findings)).toEqual(["medium"]);
      expect(findings[0].title).toBe(
        "Your link previews will be blank on X, LinkedIn and WhatsApp because these tags are added by JavaScript, which preview bots don't run",
      );
      expect(findings[0].evidence).toBe("Only added by JavaScript: og:title, og:description, og:image, twitter:card");
    });

    it("reports a mix: some tags missing, some added by JavaScript", async () => {
      const findings = await run("", og("og:title", "Harbor") + '<meta name="twitter:card" content="summary">');
      expect(severities(findings)).toEqual(["medium", "medium"]);
      expect(findings[0].evidence).toBe("Missing: og:description, og:image");
      expect(findings[1].evidence).toBe("Only added by JavaScript: og:title, twitter:card");
    });

    it("reports a JavaScript-only twitter:card as low, not medium (X falls back to the og tags)", async () => {
      const raw = FULL.replace(/<meta name="twitter:card"[^>]*>/, "");
      const findings = await run(raw, FULL);
      expect(severities(findings)).toEqual(["low"]);
      expect(findings[0].evidence).toBe("twitter:card only added by JavaScript");
    });

    it("reads the served HTML, not the rendered page, for 'present'", async () => {
      expect(severities(await run("", FULL))).toContain("medium");
    });
  });

  describe("og:image address", () => {
    it.each([
      ["/og.png", "a relative path"],
      ["//cdn.harbor.test/og.png", "a protocol-relative address"],
      ["og.png", "a bare file name"],
    ])("reports %s (%s) as low", async (image) => {
      const head = FULL.replace("https://harbor.test/og.png", image);
      const findings = await run(head);
      expect(severities(findings)).toEqual(["low"]);
      expect(findings[0].evidence).toBe(`og:image is "${image}"`);
    });

    it("accepts http and https addresses", async () => {
      expect(await run(FULL.replace("https://harbor.test/og.png", "http://harbor.test/og.png"))).toEqual([]);
    });

    it("caps the evidence at 100 characters", async () => {
      const findings = await run(FULL.replace("https://harbor.test/og.png", "/" + "x".repeat(300)));
      expect(findings[0].evidence.length).toBeLessThan(120);
    });

    it("does not complain about a missing image twice", async () => {
      const head = FULL.replace(og("og:image", "https://harbor.test/og.png"), "");
      expect(severities(await run(head))).toEqual(["medium"]);
    });
  });

  it("reports under SEO-002 and writes a fix", async () => {
    const [finding] = await run("");
    expect(finding.checkId).toBe("SEO-002");
    expect(finding.fix.length).toBeGreaterThan(10);
  });
});
