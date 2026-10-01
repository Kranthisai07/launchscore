import { describe, expect, it } from "vitest";
import type { ConsoleError } from "../../src/context.js";
import { hyg005 } from "../../src/checks/hyg-005.js";
import { makeContext } from "../helpers/context.js";
import { KEYS } from "../helpers/keys.js";

const SITE = "https://shop.test/";
const run = (errors: ConsoleError[], finalUrl = SITE) => hyg005.run(makeContext({ url: finalUrl, consoleErrors: errors }));

describe("HYG-005 first-party errors are medium", () => {
  it("reports an uncaught error from the site's own script, with count, message and file", async () => {
    const findings = await run([{ text: "ReferenceError: undefinedWidget is not defined", url: "https://shop.test/assets/app.js?v=3" }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "HYG-005", severity: "medium" });
    expect(findings[0].evidence).toBe("1 error, first: ReferenceError: undefinedWidget is not defined (in /assets/app.js)");
    expect(findings[0].title).toContain("console");
  });

  it.each([
    ["a subdomain of the site", "https://cdn.shop.test/a.js"],
    ["the www version", "https://www.shop.test/a.js"],
  ])("counts %s as the site itself", async (_name, url) => {
    expect((await run([{ text: "boom", url }]))[0].severity).toBe("medium");
  });

  it("treats the parent domain as first-party when the site is on a subdomain", async () => {
    expect((await run([{ text: "boom", url: "https://shop.test/a.js" }], "https://app.shop.test/"))[0].severity).toBe("medium");
  });

  it("is medium when first-party and third-party errors are mixed, and names the first-party one", async () => {
    const findings = await run([
      { text: "third party broke", url: "https://widgets.example.net/w.js" },
      { text: "mine broke", url: "https://shop.test/app.js" },
    ]);
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].evidence).toBe("2 errors, first: mine broke (in /app.js)");
  });
});

describe("HYG-005 third-party and unknown sources are low", () => {
  it("reports errors that only come from other sites' scripts as low", async () => {
    const findings = await run([{ text: "Uncaught TypeError: x is not a function", url: "https://widgets.example.net/w.js" }]);
    expect(findings[0].severity).toBe("low");
    expect(findings[0].evidence).toBe("1 error, first: Uncaught TypeError: x is not a function (from widgets.example.net)");
  });

  it("downgrades an error with no known source to low", async () => {
    const findings = await run([{ text: "Uncaught (in promise)" }]);
    expect(findings[0].severity).toBe("low");
    expect(findings[0].evidence).toBe("1 error, first: Uncaught (in promise)");
  });

  it("does not mistake a lookalike domain for the site", async () => {
    expect((await run([{ text: "x", url: "https://notshop.test/a.js" }]))[0].severity).toBe("low");
    expect((await run([{ text: "x", url: "https://shop.test.evil.example/a.js" }]))[0].severity).toBe("low");
  });
});

describe("HYG-005 ignores noise", () => {
  it.each([
    ["a missing favicon", { text: "Failed to load resource: the server responded with a status of 404 (Not Found)", url: "https://shop.test/favicon.ico" }],
    ["a missing png favicon", { text: "Failed to load resource", url: "https://shop.test/assets/favicon-32x32.png" }],
    ["a missing apple touch icon", { text: "Failed to load resource", url: "https://shop.test/apple-touch-icon.png" }],
    ["a Chrome extension", { text: "Uncaught Error", url: "chrome-extension://abcdef/content.js" }],
    ["a Firefox extension", { text: "Uncaught Error", url: "moz-extension://abcdef/content.js" }],
    ["extension text with no source", { text: "Denying load of chrome-extension://abc/x.js" }],
    ["an ad blocker", { text: "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT", url: "https://ads.example.net/x.js" }],
  ] as [string, ConsoleError][])("%s", async (_name, error) => {
    expect(await run([error])).toEqual([]);
  });

  it("counts only the real errors", async () => {
    const findings = await run([
      { text: "Failed to load resource", url: "https://shop.test/favicon.ico" },
      { text: "real one", url: "https://shop.test/a.js" },
      { text: "another real one", url: "https://shop.test/b.js" },
    ]);
    expect(findings[0].evidence).toBe("2 errors, first: real one (in /a.js)");
  });

  it("still reports other failed resources from the site", async () => {
    expect(await run([{ text: "Failed to load resource: 404", url: "https://shop.test/images/hero.png" }])).toHaveLength(1);
  });

  it("is clean with no errors", async () => {
    expect(await run([])).toEqual([]);
  });
});

describe("HYG-005 never prints a secret", () => {
  it.each([
    ["a Stripe live key", KEYS.stripeLive],
    ["an OpenAI key", KEYS.openaiProject],
    ["a GitHub token", KEYS.githubClassic],
    ["a long random token", "Zk3dE6gH9jK2mN5pQ8sT1vW4yZ7xC0aB"],
  ])("redacts %s in the message", async (_name, secret) => {
    const findings = await run([{ text: `Request failed with key ${secret} for user`, url: "https://shop.test/a.js" }]);
    expect(findings[0].evidence).not.toContain(secret);
    expect(findings[0].evidence).toContain("…");
  });

  it("drops query strings from addresses in the message", async () => {
    const findings = await run([{ text: "Failed to fetch https://api.shop.test/v1?token=abc123secret&x=1", url: "https://shop.test/a.js" }]);
    expect(findings[0].evidence).toContain("https://api.shop.test/v1?…");
    expect(findings[0].evidence).not.toContain("abc123secret");
  });

  it("cuts long messages and keeps them on one line", async () => {
    const findings = await run([{ text: `first line\n${"x ".repeat(200)}`, url: "https://shop.test/a.js" }]);
    expect(findings[0].evidence).not.toContain("\n");
    expect(findings[0].evidence.length).toBeLessThan(260);
    expect(findings[0].evidence).toContain("…");
  });
});
