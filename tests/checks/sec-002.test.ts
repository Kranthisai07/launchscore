import { describe, expect, it } from "vitest";
import { sec002 } from "../../src/checks/sec-002.js";
import { fetched, makeContext, routedFetch } from "../helpers/context.js";

const map = (sourcesContent: unknown = ["const secret = 1;"]) =>
  JSON.stringify({ version: 3, sources: ["a.js"], sourcesContent, mappings: "AAAA" });
const script = (url: string, tail: string, headers?: Record<string, string>) => ({
  url,
  body: `console.log(1);\n${tail}\n`,
  headers,
});
const comment = (ref: string) => `//# sourceMappingURL=${ref}`;

describe("SEC-002 finds public source maps", () => {
  it("fetches a map referenced by a comment and reports it once, without the query string", async () => {
    const fetch = routedFetch({ "https://shop.test/assets/app.js.map?v=3": fetched(200, map()) });
    const findings = await sec002.run(
      makeContext({ scripts: [script("https://shop.test/assets/app.js", comment("app.js.map?v=3"))], fetch }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      checkId: "SEC-002",
      severity: "medium",
      evidence: "https://shop.test/assets/app.js.map",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("finds maps named in a SourceMap or X-SourceMap response header", async () => {
    const fetch = routedFetch({
      "https://shop.test/a.js.map": fetched(200, map()),
      "https://shop.test/b.js.map": fetched(200, map()),
    });
    const scripts = [
      script("https://shop.test/a.js", "", { sourcemap: "/a.js.map" }),
      script("https://shop.test/b.js", "", { "x-sourcemap": "b.js.map" }),
    ];
    const findings = await sec002.run(makeContext({ scripts, fetch }));
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toBe("https://shop.test/a.js.map and 1 more");
  });

  it("resolves references against the script URL", async () => {
    const fetch = routedFetch({ "https://cdn.shop.test/maps/x.map": fetched(200, map()) });
    const scripts = [script("https://cdn.shop.test/js/x.js", comment("../maps/x.map"))];
    expect(await sec002.run(makeContext({ scripts, fetch }))).toHaveLength(1);
  });

  it("uses the last sourceMappingURL comment in a file", async () => {
    const fetch = routedFetch({ "https://shop.test/last.map": fetched(200, map()) });
    const scripts = [script("https://shop.test/a.js", `${comment("first.map")}\n${comment("last.map")}`)];
    expect(await sec002.run(makeContext({ scripts, fetch }))).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("flags an inline (data:) map that carries the source, with no request", async () => {
    const data = `data:application/json;base64,${Buffer.from(map()).toString("base64")}`;
    const fetch = routedFetch({});
    const findings = await sec002.run(
      makeContext({ scripts: [script("https://shop.test/a.js?t=1", comment(data))], fetch }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toBe("inline source map in https://shop.test/a.js");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("recognises a map whose body was cut at the size cap", async () => {
    const cut = '{"version":3,"sources":["a.js"],"sourcesContent":["const x = 1;';
    const fetch = routedFetch({ "https://shop.test/a.js.map": fetched(200, cut, {}, true) });
    const scripts = [script("https://shop.test/a.js", comment("a.js.map"))];
    expect(await sec002.run(makeContext({ scripts, fetch }))).toHaveLength(1);
  });
});

describe("SEC-002 stays quiet", () => {
  const run = (response: ReturnType<typeof fetched> | null) =>
    sec002.run(
      makeContext({
        scripts: [script("https://shop.test/a.js", comment("a.js.map"))],
        fetch: routedFetch({ "https://shop.test/a.js.map": response }),
      }),
    );

  it.each([
    ["a 404", fetched(404, "Not found")],
    ["a 403", fetched(403, "")],
    ["an HTML page returned with 200 (soft 404)", fetched(200, "<!doctype html><html></html>")],
    ["a map without sourcesContent", fetched(200, JSON.stringify({ version: 3, sources: ["a.js"], mappings: "AAAA" }))],
    ["a map whose sourcesContent is empty", fetched(200, map([]))],
    ["a map whose sourcesContent entries are blank or null", fetched(200, map([null, "  "]))],
    ["a failed or blocked request", null],
  ])("%s", async (_name, response) => {
    expect(await run(response)).toEqual([]);
  });

  it("never guesses a map URL when nothing references one", async () => {
    const fetch = routedFetch({ "https://shop.test/a.js.map": fetched(200, map()) });
    const findings = await sec002.run(
      makeContext({ scripts: [script("https://shop.test/a.js", "console.log(2)")], fetch }),
    );
    expect(findings).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores the phrase when it is inside code rather than a comment line", async () => {
    const body = `var re = "//# sourceMappingURL=" + name; // sourceMappingURL=x.map is mentioned in docs`;
    const fetch = routedFetch({});
    const scripts = [{ url: "https://shop.test/lib.js", body }];
    expect(await sec002.run(makeContext({ scripts, fetch }))).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips non-http references", async () => {
    const fetch = routedFetch({});
    const scripts = [script("https://shop.test/a.js", comment("file:///etc/passwd"))];
    expect(await sec002.run(makeContext({ scripts, fetch }))).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

// Real shapes (recorded 2026-10, only the file names): library maps that must not be reported.
const posthogSources = [
  "../../browser-common/dist/utils/globals.mjs",
  "../src/utils/globals.ts",
  "../../browser-common/dist/config.mjs",
  "../../core/dist/types.mjs",
  "../../core/dist/utils/string-utils.mjs",
  ...Array.from({ length: 125 }, (_, i) => `../../core/dist/utils/part-${i}.mjs`),
];
const segmentSources = [
  "webpack://@segment/analytics-next/webpack/runtime/load script",
  "webpack://@segment/analytics-next/../../node_modules/inherits/inherits_browser.js",
  "webpack://@segment/analytics-next/./src/core/context/index.ts",
  "webpack://@segment/analytics-next/./src/lib/fetch.ts",
];
const mapOf = (sources: string[]) =>
  JSON.stringify({ version: 3, sources, sourcesContent: sources.map((s) => `// ${s}`), mappings: "AAAA" });

describe("SEC-002 ignores open-source library maps", () => {
  it("does not report the PostHog SDK proxied on the site's own domain (1 app-looking file in 131)", async () => {
    const fetch = routedFetch({ "https://api.supermemory.ai/orange/static/array.js.map": fetched(200, mapOf(posthogSources)) });
    const scripts = [script("https://api.supermemory.ai/orange/static/array.js", comment("array.js.map"))];
    expect(await sec002.run(makeContext({ url: "https://supermemory.ai/", scripts, fetch }))).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1); // first-party, so it is looked at, then judged by its sources
  });

  it("never fetches a map hosted by another company (Segment)", async () => {
    const mapUrl = "https://cdn.segment.com/analytics.js/v1/KEY/standalone.js.map";
    const fetch = routedFetch({ [mapUrl]: fetched(200, mapOf(segmentSources)) });
    const scripts = [script("https://cdn.segment.com/analytics.js/v1/KEY/standalone.js", comment("standalone.js.map"))];
    const ctx = makeContext({ url: "https://datasentinel.streamlit.app/", scripts, fetch });
    expect(await sec002.run(ctx)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(ctx.notTested).toEqual([]);
  });

  it("ignores a third-party script's inline map", async () => {
    const data = `data:application/json;base64,${Buffer.from(map()).toString("base64")}`;
    const scripts = [script("https://widgets.example.net/w.js", comment(data))];
    expect(await sec002.run(makeContext({ scripts, fetch: routedFetch({}) }))).toEqual([]);
  });

  it("treats a sibling tenant on a hosting platform as another site", async () => {
    const fetch = routedFetch({ "https://cdn.lovable.app/a.js.map": fetched(200, map()) });
    const scripts = [script("https://cdn.lovable.app/a.js", comment("a.js.map"))];
    expect(await sec002.run(makeContext({ url: "https://myapp.lovable.app/", scripts, fetch }))).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still checks a CDN on the site's own domain", async () => {
    const fetch = routedFetch({ "https://cdn.shop.co.uk/a.js.map": fetched(200, map()) });
    const scripts = [script("https://cdn.shop.co.uk/a.js", comment("a.js.map"))];
    expect(await sec002.run(makeContext({ url: "https://www.shop.co.uk/", scripts, fetch }))).toHaveLength(1);
  });

  it.each([
    ["the site's own src/ files", ["webpack://app/./src/App.tsx", "../src/index.ts"], 1],
    ["half own code and half node_modules", ["../src/a.ts", "../node_modules/react/index.js"], 1],
    ["mostly node_modules with one own file (documented trade-off: not reported)", ["../src/a.ts", "../node_modules/a/i.js", "../node_modules/b/i.js"], 0],
    ["only dist/ build output", ["../../core/dist/a.mjs", "dist/b.js"], 0],
  ])("judges a first-party map by its sources: %s", async (_name, sources, expected) => {
    const fetch = routedFetch({ "https://shop.test/a.js.map": fetched(200, mapOf(sources)) });
    const scripts = [script("https://shop.test/a.js", comment("a.js.map"))];
    expect(await sec002.run(makeContext({ scripts, fetch }))).toHaveLength(expected);
  });

  it("judges a map cut at the size cap by the file names that arrived", async () => {
    const cut = (sources: string[]) => `{"version":3,"sources":${JSON.stringify(sources)},"sourcesContent":["const x = 1;`;
    const run = (sources: string[]) =>
      sec002.run(
        makeContext({
          scripts: [script("https://shop.test/a.js", comment("a.js.map"))],
          fetch: routedFetch({ "https://shop.test/a.js.map": fetched(200, cut(sources), {}, true) }),
        }),
      );
    expect(await run(["../node_modules/react/index.js"])).toEqual([]);
    expect(await run(["../src/a.ts"])).toHaveLength(1);
  });
});

describe("SEC-002 limits", () => {
  it("fetches at most 20 maps and requests each URL once", async () => {
    const scripts = Array.from({ length: 30 }, (_, i) =>
      script(`https://shop.test/${i}.js`, comment(`${i}.js.map`)),
    );
    scripts.push(script("https://shop.test/dup.js", comment("0.js.map")));
    const fetch = routedFetch({});
    await sec002.run(makeContext({ scripts, fetch }));
    expect(fetch).toHaveBeenCalledTimes(20);
    expect(new Set(fetch.mock.calls.map((c) => c[0])).size).toBe(20);
  });

  describe("when more than 20 maps are referenced", () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, i) => script(`https://shop.test/${i}.js`, comment(`${i}.js.map`)));

    it("records how many were not checked when none of the first 20 is public", async () => {
      const ctx = makeContext({ scripts: many(25), fetch: routedFetch({}) });
      expect(await sec002.run(ctx)).toEqual([]);
      expect(ctx.notTested).toEqual([
        { checkId: "SEC-002", title: "Public source maps", reason: "5 source maps not checked (limit 20)" },
      ]);
    });

    it("counts only distinct map URLs", async () => {
      const scripts = [...many(22), script("https://shop.test/dup.js", comment("0.js.map"))];
      const ctx = makeContext({ scripts, fetch: routedFetch({}) });
      await sec002.run(ctx);
      expect(ctx.notTested.map((n) => n.reason)).toEqual(["2 source maps not checked (limit 20)"]);
    });

    it("adds nothing when one of the first 20 is public (there is a finding already)", async () => {
      const ctx = makeContext({
        scripts: many(25),
        fetch: routedFetch({ "https://shop.test/3.js.map": fetched(200, map()) }),
      });
      expect(await sec002.run(ctx)).toHaveLength(1);
      expect(ctx.notTested).toEqual([]);
    });

    it("adds nothing at exactly 20 maps", async () => {
      const ctx = makeContext({ scripts: many(20), fetch: routedFetch({}) });
      await sec002.run(ctx);
      expect(ctx.notTested).toEqual([]);
    });
  });

  it("asks for a larger body than the default for maps", async () => {
    const fetch = routedFetch({});
    const scripts = [script("https://shop.test/a.js", comment("a.js.map"))];
    await sec002.run(makeContext({ scripts, fetch }));
    expect(fetch.mock.calls[0][1]).toMatchObject({ maxBytes: 10 * 1024 * 1024 });
  });
});
