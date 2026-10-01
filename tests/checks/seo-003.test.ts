import { describe, expect, it } from "vitest";
import { seo003 } from "../../src/checks/seo-003.js";
import { fetched, makeContext, routedFetch } from "../helpers/context.js";

const ROBOTS = "https://shop.test/robots.txt";
const SITEMAP = "https://shop.test/sitemap.xml";
const GOOD_ROBOTS = fetched(200, "User-agent: *\nAllow: /\n", { "content-type": "text/plain" });
const GOOD_SITEMAP = fetched(200, '<?xml version="1.0"?><urlset><url><loc>https://shop.test/</loc></url></urlset>', {
  "content-type": "application/xml",
});
const HOME_PAGE = fetched(200, "<!doctype html><html><head></head><body>Home</body></html>", { "content-type": "text/html" });

const run = (routes: Record<string, ReturnType<typeof fetched> | null>, finalUrl = "https://shop.test/some/page?x=1") =>
  seo003.run(makeContext({ url: finalUrl, fetch: routedFetch(routes) }));
const severities = (f: { severity: string }[]) => f.map((x) => x.severity);

describe("SEO-003 presence", () => {
  it("is clean when both files exist", async () => {
    expect(await run({ [ROBOTS]: GOOD_ROBOTS, [SITEMAP]: GOOD_SITEMAP })).toEqual([]);
  });

  it("fetches both from the origin, whatever page was scanned", async () => {
    const fetch = routedFetch({ [ROBOTS]: GOOD_ROBOTS, [SITEMAP]: GOOD_SITEMAP });
    await seo003.run(makeContext({ url: "https://shop.test/deep/page?q=1", fetch }));
    expect(fetch.mock.calls.map((c) => c[0]).sort()).toEqual([ROBOTS, SITEMAP]);
  });

  it("reports both missing (404) as two lows", async () => {
    const findings = await run({ [ROBOTS]: fetched(404), [SITEMAP]: fetched(404) });
    expect(severities(findings)).toEqual(["low", "low"]);
    expect(findings[0].title).toContain("robots.txt");
    expect(findings[1].title).toContain("sitemap.xml");
  });

  it("treats 410 as missing", async () => {
    expect(severities(await run({ [ROBOTS]: fetched(410), [SITEMAP]: GOOD_SITEMAP }))).toEqual(["low"]);
  });

  it("treats the home page returned with 200 as missing (soft 404)", async () => {
    const findings = await run({ [ROBOTS]: HOME_PAGE, [SITEMAP]: HOME_PAGE });
    expect(severities(findings)).toEqual(["low", "low"]);
  });

  it("treats an HTML content type or HTML body as a soft 404 for robots.txt", async () => {
    expect(severities(await run({ [ROBOTS]: fetched(200, "User-agent: *", { "content-type": "text/html" }), [SITEMAP]: GOOD_SITEMAP }))).toEqual(["low"]);
    expect(severities(await run({ [ROBOTS]: fetched(200, "<html>nope</html>"), [SITEMAP]: GOOD_SITEMAP }))).toEqual(["low"]);
  });

  it("requires a sitemap to look like a sitemap", async () => {
    const findings = await run({ [ROBOTS]: GOOD_ROBOTS, [SITEMAP]: fetched(200, "just some text") });
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain("sitemap.xml");
  });

  it("accepts a sitemap index", async () => {
    const index = fetched(200, "<sitemapindex><sitemap><loc>https://shop.test/s1.xml</loc></sitemap></sitemapindex>");
    expect(await run({ [ROBOTS]: GOOD_ROBOTS, [SITEMAP]: index })).toEqual([]);
  });

  it("does not report a missing sitemap when robots.txt declares one", async () => {
    const robots = fetched(200, "User-agent: *\nAllow: /\nSitemap: https://shop.test/sitemaps/main.xml\n");
    expect(await run({ [ROBOTS]: robots, [SITEMAP]: fetched(404) })).toEqual([]);
  });

  it.each([
    ["a server error", fetched(500)],
    ["a forbidden response (a bot block)", fetched(403)],
    ["a redirect to another host", fetched(302, "", { location: "https://other.test/robots.txt" })],
    ["a failed or blocked request", null],
  ])("reports nothing about robots.txt after %s, and nothing about the sitemap it cannot cross-check", async (_name, robots) => {
    expect(await run({ [ROBOTS]: robots, [SITEMAP]: fetched(404) })).toEqual([]);
  });

  it("reports nothing for a sitemap that failed to load", async () => {
    expect(await run({ [ROBOTS]: GOOD_ROBOTS, [SITEMAP]: null })).toEqual([]);
    expect(await run({ [ROBOTS]: GOOD_ROBOTS, [SITEMAP]: fetched(503) })).toEqual([]);
  });
});

describe("SEO-003 blocking everything", () => {
  const block = (text: string) => run({ [ROBOTS]: fetched(200, text, { "content-type": "text/plain" }), [SITEMAP]: GOOD_SITEMAP });

  it("reports Disallow: / for every bot as high", async () => {
    const findings = await block("User-agent: *\nDisallow: /\n");
    expect(severities(findings)).toEqual(["high"]);
    expect(findings[0]).toMatchObject({ checkId: "SEO-003" });
    expect(findings[0].title).toContain("robots.txt");
  });

  it.each([
    ["different case and spacing", "USER-AGENT:   *\r\ndisallow:   /   \r\n"],
    ["a comment on the line", "User-agent: * # everyone\nDisallow: / # all\n"],
    ["several agents sharing a group", "User-agent: googlebot\nUser-agent: *\nDisallow: /\n"],
    ["the group split across blocks", "User-agent: *\nDisallow: /private\n\nUser-agent: *\nDisallow: /\n"],
    ["blocking after other rules", "User-agent: *\nDisallow: /admin\nDisallow: /\n"],
  ])("detects it with %s", async (_name, text) => {
    expect(severities(await block(text))).toEqual(["high"]);
  });

  it.each([
    ["Disallow with nothing (allows everything)", "User-agent: *\nDisallow:\n"],
    ["only a sub-path", "User-agent: *\nDisallow: /admin\n"],
    ["a different bot blocked", "User-agent: badbot\nDisallow: /\n\nUser-agent: *\nAllow: /\n"],
    ["Allow: / in the same group (the tie goes to Allow)", "User-agent: *\nAllow: /\nDisallow: /\n"],
    ["a commented-out line", "User-agent: *\n# Disallow: /\nAllow: /\n"],
    ["a rule before any user-agent", "Disallow: /\n"],
    ["Disallow: /* style prefixes", "User-agent: *\nDisallow: /*.pdf\n"],
  ])("does not flag %s", async (_name, text) => {
    expect(await block(text)).toEqual([]);
  });

  it("does not let a Disallow: / belonging to another group leak into the * group", async () => {
    const text = "User-agent: *\nAllow: /\n\nUser-agent: ahrefsbot\nDisallow: /\n";
    expect(await block(text)).toEqual([]);
  });
});
