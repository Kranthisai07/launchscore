import { describe, expect, it } from "vitest";
import { hyg003 } from "../../src/checks/hyg-003.js";
import { makeContext, page } from "../helpers/context.js";

const run = (body: string, head = "") => hyg003.run(makeContext({ html: page(head, body) }));

describe("HYG-003 flags placeholder text", () => {
  it.each([
    ["Lorem ipsum", "<p>Lorem ipsum dolor sit amet</p>"],
    ["Your Company", "<h1>Welcome to Your Company</h1>"],
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
