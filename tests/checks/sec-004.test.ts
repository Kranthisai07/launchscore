import { describe, expect, it, vi } from "vitest";
import { sec004 } from "../../src/checks/sec-004.js";
import type { FetchResult } from "../../src/fetcher.js";
import type { PageContext } from "../../src/context.js";
import { makeContext } from "../helpers/context.js";

const reply = (status: number, location?: string): FetchResult => ({
  url: "http://shop.test/",
  status,
  headers: location ? { location } : {},
  body: "",
  bytes: Buffer.alloc(0),
  truncated: false,
});

const mockFetch = (result: FetchResult | null) => vi.fn(async () => result);

const run = (overrides: Partial<PageContext>) => sec004.run(makeContext(overrides));

describe("SEC-004: the page itself", () => {
  it("reports an http page on a real domain as high", async () => {
    const fetch = mockFetch(reply(200));
    const findings = await run({ url: "http://shop.test/", fetch });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "SEC-004", severity: "high" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports an https request that ended on http as high", async () => {
    const findings = await run({ url: "https://shop.test/", finalUrl: "http://shop.test/", fetch: mockFetch(reply(200)) });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("high");
  });

  it.each(["http://localhost:3000/", "http://127.0.0.1:8080/"])("never flags %s", async (url) => {
    const fetch = mockFetch(reply(200));
    expect(await run({ url, fetch })).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is fine when an http request was upgraded to https", async () => {
    const fetch = mockFetch(reply(200));
    expect(await run({ url: "http://shop.test/", finalUrl: "https://shop.test/", fetch })).toEqual([]);
    expect(fetch).not.toHaveBeenCalled(); // the user gave http, so there is nothing more to try
  });
});

describe("SEC-004: the http:// version of an https site", () => {
  const base = { url: "https://shop.test/" };

  it("requests the http version once, without following redirects, through ctx.fetch", async () => {
    const fetch = mockFetch(reply(301, "https://shop.test/"));
    await run({ ...base, fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("http://shop.test/", { followRedirects: false });
  });

  it.each([301, 302, 303, 307, 308])("passes on a %i redirect to https", async (status) => {
    expect(await run({ ...base, fetch: mockFetch(reply(status, "https://shop.test/")) })).toEqual([]);
  });

  it("resolves a relative redirect against the http URL (stays on http, so it fails)", async () => {
    expect(await run({ ...base, fetch: mockFetch(reply(301, "/home")) })).toHaveLength(1);
  });

  it.each([
    ["serves the page over http", reply(200)],
    ["redirects to another http address", reply(301, "http://shop.test/home")],
    ["redirects with no Location", reply(301)],
    ["answers with an error", reply(500)],
  ])("reports medium when the site %s", async (_name, response) => {
    const findings = await run({ ...base, fetch: mockFetch(response) });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "SEC-004", severity: "medium" });
    expect(findings[0].evidence).toContain("http://shop.test/");
  });

  it("reports nothing when the request fails, times out or is blocked (null)", async () => {
    expect(await run({ ...base, fetch: mockFetch(null) })).toEqual([]);
  });

  it("skips the check on a custom port", async () => {
    const fetch = mockFetch(reply(200));
    expect(await run({ url: "https://shop.test:8443/", fetch })).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
