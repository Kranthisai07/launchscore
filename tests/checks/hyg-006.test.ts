import { describe, expect, it, vi } from "vitest";
import { hyg006, MAX_LINKS, SOFT_404_REASON } from "../../src/checks/hyg-006.js";
import type { FetchResult, PageFetch } from "../../src/fetcher.js";
import { fetched, makeContext } from "../helpers/context.js";

const BASE = "https://shop.test";
const link = (path: string) => `${BASE}${path}`;
const PROBE = /^https:\/\/shop\.test\/launchscore-check-[0-9a-f]{8}$/;

type Answer = FetchResult | null;
// answers: path -> { HEAD?, GET? }; the probe path gets `probe`. Anything not listed is a 200.
function site(answers: Record<string, { HEAD?: Answer; GET?: Answer }>, probe: Answer = fetched(404)) {
  const calls: { url: string; method: string }[] = [];
  const fetch = vi.fn<PageFetch>(async (url, options) => {
    const method = options?.method ?? "GET";
    calls.push({ url, method });
    if (PROBE.test(url)) return probe;
    const path = new URL(url).pathname + new URL(url).search;
    const entry = answers[path] ?? {};
    return method in entry ? (entry as Record<string, Answer>)[method] : fetched(200);
  });
  return { fetch, calls };
}

const run = (links: string[], fetch: PageFetch, extra: Parameters<typeof makeContext>[0] = {}) => {
  const ctx = makeContext({ url: `${BASE}/`, links, fetch, ...extra });
  return hyg006.run(ctx).then((findings) => ({ findings, ctx }));
};

describe("HYG-006 finds broken links", () => {
  it("reports one medium finding with the count and the first three paths", async () => {
    const { fetch } = site({ "/a": { HEAD: fetched(404), GET: fetched(404) }, "/b": { HEAD: fetched(404), GET: fetched(410) }, "/c": { HEAD: fetched(404), GET: fetched(404) }, "/d": { HEAD: fetched(404), GET: fetched(404) } });
    const { findings } = await run(["/a", "/b", "/c", "/d", "/ok"].map(link), fetch);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "HYG-006", severity: "medium" });
    expect(findings[0].evidence).toBe("4 broken links, first: /a, /b, /c");
  });

  it("uses singular for one", async () => {
    const { fetch } = site({ "/gone": { HEAD: fetched(404), GET: fetched(404) } });
    const { findings } = await run([link("/gone")], fetch);
    expect(findings[0].evidence).toBe("1 broken link, first: /gone");
  });

  it("shows paths only, never a query string", async () => {
    const { fetch } = site({ "/x?token=secret": { HEAD: fetched(404), GET: fetched(404) } });
    const { findings } = await run([link("/x?token=secret")], fetch);
    expect(findings[0].evidence).toBe("1 broken link, first: /x");
    expect(findings[0].evidence).not.toContain("secret");
  });

  it("is clean when every link works", async () => {
    const { fetch } = site({});
    expect((await run(["/a", "/b"].map(link), fetch)).findings).toEqual([]);
  });
});

describe("HYG-006 HEAD then GET", () => {
  it("accepts a working link after a HEAD alone", async () => {
    const { fetch, calls } = site({});
    await run([link("/a")], fetch);
    expect(calls.filter((c) => !PROBE.test(c.url))).toEqual([{ url: link("/a"), method: "HEAD" }]);
  });

  it("confirms a failed HEAD with a GET", async () => {
    const { fetch, calls } = site({ "/a": { HEAD: fetched(404), GET: fetched(404) } });
    await run([link("/a")], fetch);
    expect(calls.filter((c) => !PROBE.test(c.url)).map((c) => c.method)).toEqual(["HEAD", "GET"]);
  });

  it.each([
    ["405", fetched(405)],
    ["501", fetched(501)],
    ["a wrong 404", fetched(404)],
    ["a failed request", null],
  ])("trusts the GET when HEAD gives %s and the GET works", async (_name, head) => {
    const { fetch } = site({ "/a": { HEAD: head, GET: fetched(200) } });
    expect((await run([link("/a")], fetch)).findings).toEqual([]);
  });

  it.each([
    ["403", fetched(403)],
    ["500", fetched(500)],
    ["429", fetched(429)],
    ["a failed request", null],
  ])("does not call a link broken when the GET gives %s", async (_name, get) => {
    const { fetch } = site({ "/a": { HEAD: fetched(405), GET: get } });
    expect((await run([link("/a")], fetch)).findings).toEqual([]);
  });

  it("counts a redirect that ends well as working", async () => {
    const { fetch } = site({ "/a": { HEAD: fetched(301, "", { location: "/b" }) } });
    expect((await run([link("/a")], fetch)).findings).toEqual([]);
  });
});

describe("HYG-006 and sites that never say 'not found' (soft 404)", () => {
  it("adds a not-tested note instead of reporting clean", async () => {
    const { fetch, calls } = site({}, fetched(200, "<!doctype html><html>Home</html>", { "content-type": "text/html" }));
    const { findings, ctx } = await run(["/a", "/b"].map(link), fetch);
    expect(findings).toEqual([]);
    expect(ctx.notTested).toEqual([
      { checkId: "HYG-006", title: "Broken internal links", reason: "broken links can't be checked: site returns the home page for every address" },
    ]);
    expect(SOFT_404_REASON).toBe(ctx.notTested[0].reason);
    expect(calls).toHaveLength(1); // only the probe: the links were not judged
  });

  it("probes one address that cannot exist, from the site's origin", async () => {
    const { fetch, calls } = site({});
    await run([link("/a")], fetch, { finalUrl: `${BASE}/deep/page` });
    const probes = calls.filter((c) => PROBE.test(c.url));
    expect(probes).toHaveLength(1);
    expect(probes[0].method).toBe("GET");
  });

  it.each([
    ["410", fetched(410)],
    ["a failed request", null],
    ["a server error", fetched(500)],
    ["a forbidden response", fetched(403)],
  ])("goes ahead when the probe gives %s", async (_name, probe) => {
    const { fetch } = site({ "/a": { HEAD: fetched(404), GET: fetched(404) } }, probe);
    const { findings, ctx } = await run([link("/a")], fetch);
    expect(findings).toHaveLength(1);
    expect(ctx.notTested).toEqual([]);
  });

  it("makes no requests when the page has no internal links", async () => {
    const { fetch } = site({});
    const { findings } = await run([], fetch);
    expect(findings).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("HYG-006 limits", () => {
  it("never checks the page itself", async () => {
    const { fetch, calls } = site({});
    await run([`${BASE}/`, `${BASE}/#top`, link("/a")], fetch);
    expect(calls.filter((c) => !PROBE.test(c.url)).map((c) => c.url)).toEqual([link("/a")]);
  });

  it(`checks at most ${MAX_LINKS} links and says how many were left`, async () => {
    const links = Array.from({ length: 60 }, (_, i) => link(`/p${i}`));
    const { fetch, calls } = site({});
    const { ctx } = await run(links, fetch);
    expect(calls.filter((c) => !PROBE.test(c.url) && c.method === "HEAD")).toHaveLength(MAX_LINKS);
    expect(ctx.notTested).toEqual([{ checkId: "HYG-006", title: "Broken internal links", reason: "10 links not checked (limit 50)" }]);
  });

  it("adds no note at exactly 50 links", async () => {
    const { fetch } = site({});
    const { ctx } = await run(Array.from({ length: 50 }, (_, i) => link(`/p${i}`)), fetch);
    expect(ctx.notTested).toEqual([]);
  });

  it("stops after the time budget and records how many links were skipped", async () => {
    const { fetch } = site({});
    vi.useFakeTimers();
    try {
      const now = Date.now();
      // The first two links start at once; time then jumps past the 30 s budget.
      let started = 0;
      const slow = vi.fn<PageFetch>(async (url, options) => {
        if (PROBE.test(url)) return fetched(404);
        started++;
        if (started === 1) vi.setSystemTime(now + 31_000);
        return fetched(200);
      });
      const ctx = makeContext({ url: `${BASE}/`, links: ["/a", "/b", "/c"].map(link), fetch: slow });
      const findings = await hyg006.run(ctx);
      expect(findings).toEqual([]);
      expect(ctx.notTested.map((n) => n.reason)).toEqual(["2 links not checked (time limit)"]);
      void fetch;
    } finally {
      vi.useRealTimers();
    }
  });
});
