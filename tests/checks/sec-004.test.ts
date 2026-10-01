import { describe, expect, it, vi } from "vitest";
import { createSec004 } from "../../src/checks/sec-004.js";
import { makeContext } from "../helpers/context.js";

const reply = (status: number, location?: string): Response =>
  new Response(null, { status, headers: location ? { location } : {} });

const mockFetch = (result: Response | Error) =>
  vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });

describe("SEC-004: the page itself", () => {
  it("reports an http page on a real domain as high", async () => {
    const fetchImpl = mockFetch(reply(200));
    const findings = await createSec004(fetchImpl).run(makeContext({ url: "http://shop.test/" }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "SEC-004", severity: "high" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports an https request that ended on http as high", async () => {
    const findings = await createSec004(mockFetch(reply(200))).run(
      makeContext({ url: "https://shop.test/", finalUrl: "http://shop.test/" }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("high");
  });

  it.each(["http://localhost:3000/", "http://127.0.0.1:8080/"])("never flags %s", async (url) => {
    const fetchImpl = mockFetch(reply(200));
    expect(await createSec004(fetchImpl).run(makeContext({ url }))).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("is fine when an http request was upgraded to https", async () => {
    const fetchImpl = mockFetch(reply(200));
    const ctx = makeContext({ url: "http://shop.test/", finalUrl: "https://shop.test/" });
    expect(await createSec004(fetchImpl).run(ctx)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled(); // the user gave http, so there is nothing more to try
  });
});

describe("SEC-004: the http:// version of an https site", () => {
  const ctx = makeContext({ url: "https://shop.test/" });

  it("requests the http version once, without following redirects", async () => {
    const fetchImpl = mockFetch(reply(301, "https://shop.test/"));
    await createSec004(fetchImpl).run(ctx);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("http://shop.test/", expect.objectContaining({ redirect: "manual" }));
  });

  it.each([301, 302, 303, 307, 308])("passes on a %i redirect to https", async (status) => {
    expect(await createSec004(mockFetch(reply(status, "https://shop.test/"))).run(ctx)).toEqual([]);
  });

  it("resolves a relative redirect against the http URL (stays on http, so it fails)", async () => {
    const findings = await createSec004(mockFetch(reply(301, "/home"))).run(ctx);
    expect(findings).toHaveLength(1);
  });

  it.each([
    ["serves the page over http", reply(200)],
    ["redirects to another http address", reply(301, "http://shop.test/home")],
    ["redirects with no Location", reply(301)],
    ["answers with an error", reply(500)],
  ])("reports medium when the site %s", async (_name, response) => {
    const findings = await createSec004(mockFetch(response)).run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "SEC-004", severity: "medium" });
    expect(findings[0].evidence).toContain("http://shop.test/");
  });

  it("reports nothing when the request fails or times out", async () => {
    expect(await createSec004(mockFetch(new Error("connect ECONNREFUSED"))).run(ctx)).toEqual([]);
  });

  it("skips the check on a custom port", async () => {
    const fetchImpl = mockFetch(reply(200));
    expect(await createSec004(fetchImpl).run(makeContext({ url: "https://shop.test:8443/" }))).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
