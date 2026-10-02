import { describe, expect, it } from "vitest";
import { hyg003 } from "../../src/checks/hyg-003.js";
import { makeContext, page } from "../helpers/context.js";

const run = (body: string, head = "") => hyg003.run(makeContext({ html: page(head, body) }));

describe("HYG-003 flags placeholder text", () => {
  it.each([
    ["Lorem ipsum", "<p>Lorem ipsum dolor sit amet</p>"],
    ["Your Company (the whole element)", "<h1>Your Company</h1>"],
    ["Your Company Name", "<p>Welcome to Your Company Name</p>"],
    ["Your Company Inc", "<p>Built by Your Company Inc.</p>"],
    ["Your Company after a copyright mark", "<footer>© 2025 Your Company. All rights reserved.</footer>"],
    ["Company Name", "<footer>© 2026 Company Name</footer>"],
    ["John Doe", "<blockquote>Great! - John Doe</blockquote>"],
    ["Jane Doe", "<blockquote>Great! - Jane Doe</blockquote>"],
    ["email", "<p>Write to test@example.com</p>"],
    ["email", "<p>Write to hello@test.com</p>"],
  ])("%s", async (_name, body) => {
    const findings = await run(body);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "HYG-003", severity: "medium" });
  });

  it("matches regardless of case", async () => {
    expect(await run("<p>LOREM IPSUM</p>")).toHaveLength(1);
  });

  it("flags placeholder text in the page title", async () => {
    expect(await run("<p>hi</p>", "<title>Your Company</title>")).toHaveLength(1);
  });

  it("reports one finding per pattern, with a short visible-text snippet", async () => {
    const findings = await run(
      "<p>Lorem ipsum one</p><p>Lorem ipsum two</p><p>Email test@example.com and john@example.com</p>",
    );
    expect(findings).toHaveLength(2);
    expect(findings[0].evidence).toContain("Lorem ipsum one");
    expect(findings[0].evidence).not.toContain("<");
    expect(findings[1].evidence).toContain("test@example.com");
  });

  it("keeps snippets short", async () => {
    const [finding] = await run(`<p>${"a ".repeat(100)}lorem ipsum${" b".repeat(100)}</p>`);
    expect(finding.evidence.length).toBeLessThan(120);
  });
});

describe("HYG-003 placeholder context (round 2 false positives)", () => {
  it.each([
    // the three real sentences that were wrongly flagged
    ["pavebank", "<p>Information from another authorized user in your company (if applicable). Important For security</p>"],
    ["uds", "<p>What AI and machine learning services does your company offer? Cyber Security</p>"],
    ["opendevhub", "<p>A bot that notifies you on Slack whenever your company/product is mentioned on Hacker News.</p>"],
    // Title Case, but ordinary headlines and form labels
    ["a headline", "<h1>Grow Your Company Faster</h1>"],
    ["a headline with the word at the end", "<h2>Take Control of Your Company</h2>"],
    ["a Company Name label in a span", '<span class="field">Company Name</span><input name="c">'],
    ["a Company Name label in a div", '<div>Company Name</div><input name="c">'],
    ["a Company Name label", '<label for="c">Company Name</label><input id="c">'],
    ["a Your Company label", '<label for="c">Your Company</label><input id="c">'],
    ["Company Name on its own in a paragraph", "<p>Please type your Company Name below.</p>"],
  ])("ignores %s", async (_name, body) => {
    expect(await run(body)).toEqual([]);
  });

  it("reports © 2025 Your Company Name (syntro-astro) as exactly one finding, not two", async () => {
    const findings = await run("<footer>Contact Support Live Chat © 2025 Your Company Name. Crafted by Michael Andreuzza &amp; Getastro</footer>");
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("Placeholder text is still on your page: Your Company");
    expect(findings[0].evidence).toContain("© 2025 Your Company Name");
  });

  it("reports © 2025 Company Name once, as Company Name", async () => {
    const findings = await run("<footer>© 2025 Company Name</footer>");
    expect(findings.map((f) => f.title)).toEqual(["Placeholder text is still on your page: Company Name"]);
  });

  it("still reports two different placeholders that do not overlap", async () => {
    const findings = await run("<footer>© 2025 Your Company Name</footer><blockquote>Great - John Doe</blockquote>");
    expect(findings).toHaveLength(2);
  });

  it("does not match placeholder phrases in lowercase or uppercase prose", async () => {
    expect(await run("<p>your company name and YOUR COMPANY NAME, john doe</p>")).toEqual([]);
  });
});

describe("HYG-003 placeholders in the title and link-preview tags", () => {
  // the head of syntro-astro.vercel.app
  const syntro = `<title>Astro SaaS &amp; Startup Template</title>
    <meta name="author" content="Your Name or Company Name">
    <meta property="og:image" content="/og-image.png">
    <meta property="og:url" content="https://www.yourwebsite.com/">
    <meta property="og:title" content="Your Website Title">
    <meta property="og:description" content="A brief description of your website content.">
    <meta property="og:image" content="https://www.yourwebsite.com/path/to/image.jpg">
    <meta property="twitter:title" content="Your Website Title">
    <meta property="twitter:image" content="https://www.yourwebsite.com/path/to/image.jpg">
    <link rel="canonical" href="https://www.yourwebsite.com/">`;
  const runMeta = (head: string, raw = head) => hyg003.run(makeContext({ html: page(head, "<h1>Hello</h1>"), rawHtml: page(raw, "<h1>Hello</h1>") }));

  it("reports one finding listing each placeholder tag", async () => {
    const findings = await runMeta(syntro);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "HYG-003", severity: "medium", title: "Placeholder text is still in your page's title or link-preview tags" });
    const evidence = findings[0].evidence;
    for (const tag of ["author = \"Your Name or Company Name\"", "og:title = \"Your Website Title\"", "og:url = \"https://www.yourwebsite.com/\"", "twitter:title"]) {
      expect(evidence).toContain(tag);
    }
  });

  it("does not report the canonical link here (SEO-005 owns it)", async () => {
    expect(await runMeta('<link rel="canonical" href="https://www.yourwebsite.com/">')).toEqual([]);
  });

  it("finds a placeholder that is only in the page as served, or only after JavaScript", async () => {
    expect(await runMeta("<title>Fine</title>", '<title>Fine</title><meta property="og:title" content="Your Website Title">')).toHaveLength(1);
    expect(await runMeta('<title>Your Website Title</title>', "<title>Fine</title>")).toHaveLength(1);
  });

  it("matches example.com as an address, but not look-alike domains or example.com in prose", async () => {
    expect(await runMeta('<meta property="og:url" content="https://example.com/">')).toHaveLength(1);
    expect(await runMeta('<meta property="og:image" content="https://cdn.example.com/a.png">')).toHaveLength(1);
    expect(await runMeta('<meta property="og:url" content="https://myexample.com/">')).toEqual([]);
    expect(await runMeta('<meta name="description" content="Use example.com for documentation examples.">')).toEqual([]);
  });

  it("is quiet for a real head", async () => {
    expect(
      await runMeta(
        '<title>Harbor Bakery</title><meta name="description" content="Fresh bread"><meta name="author" content="Ana Torres"><meta property="og:url" content="https://harborbakery.com/"><meta property="og:image" content="https://harborbakery.com/og.png">',
      ),
    ).toEqual([]);
  });

  it("caps the evidence at five tags", async () => {
    const head = ["og:title", "og:description", "og:site_name", "twitter:title", "twitter:description", "author"]
      .map((n) => `<meta ${n === "author" ? "name" : "property"}="${n}" content="Your Website Title">`)
      .join("");
    const [finding] = await runMeta(head);
    expect(finding.evidence).toContain("and 1 more");
  });
});

describe("HYG-003 stays quiet", () => {
  it.each([
    ["Coming soon", "<h1>Coming soon</h1>"],
    ["real content", "<p>Fresh sourdough, delivered to your door.</p>"],
    ["a real email", "<p>hello@harborbakery.com</p>"],
    ["lookalike domain", "<p>hello@myexample.com and a@test.co</p>"],
    ["script bodies", '<script>var a = "lorem ipsum John Doe test@example.com";</script>'],
    ["style blocks", "<style>/* Your Company */</style>"],
    ["noscript blocks", "<noscript>Lorem ipsum</noscript>"],
    ["HTML comments", "<!-- Lorem ipsum, John Doe -->"],
    ["attributes", '<input placeholder="you@example.com" value="John Doe" title="Lorem ipsum">'],
    ["form labels", '<label for="c">Company name</label><input id="c">'],
    ["select options", "<select><option>Company Name</option></select>"],
  ])("%s", async (_name, body) => {
    expect(await run(body)).toEqual([]);
  });

  it("does not search the JS bundles", async () => {
    const ctx = makeContext({
      html: page("", "<p>Hello</p>"),
      scripts: [{ url: "https://shop.test/vendor.js", body: "// Lorem ipsum, John Doe, test@example.com" }],
    });
    expect(await hyg003.run(ctx)).toEqual([]);
  });
});
