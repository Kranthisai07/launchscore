import { describe, expect, it, vi } from "vitest";
import { createFetcher, MAX_CONCURRENT_REQUESTS } from "../src/fetcher.js";

type Init = { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> };

const respond = (status = 200, body = "ok", headers: Record<string, string> = {}): Response =>
  new Response(status === 204 || (status >= 300 && status < 400) ? null : body, { status, headers });

const make = (impl: (url: string, init: Init) => Promise<Response>, extra: Partial<Parameters<typeof createFetcher>[0]> = {}) =>
  createFetcher({ allowedHosts: ["shop.test"], fetchImpl: impl, ...extra });

describe("createFetcher", () => {
  it("returns status, lowercased headers and the body", async () => {
    const fetcher = make(async () => respond(200, "hello", { "Content-Type": "text/plain", "X-Thing": "1" }));
    expect(await fetcher("https://shop.test/a")).toEqual({
      url: "https://shop.test/a",
      status: 200,
      headers: expect.objectContaining({ "content-type": "text/plain", "x-thing": "1" }),
      body: "hello",
      truncated: false,
    });
  });

  it("sends a launchscore user agent and never lets fetch follow redirects itself", async () => {
    const impl = vi.fn(async (_url: string, _init: Init) => respond());
    await make(impl)("https://shop.test/");
    expect(impl.mock.calls[0][1]).toMatchObject({ redirect: "manual", headers: { "user-agent": "launchscore" } });
  });

  it("never runs more than 5 requests at once (12 in parallel)", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetcher = make(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return respond();
    });
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => fetcher(`https://shop.test/${i}`)));
    expect(results.every((r) => r?.status === 200)).toBe(true);
    expect(peak).toBe(MAX_CONCURRENT_REQUESTS);
  });

  it("returns null when the request times out", async () => {
    const fetcher = make(
      (_url, init) =>
        new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))),
      { timeoutMs: 30 },
    );
    expect(await fetcher("https://shop.test/slow")).toBeNull();
  });

  it("returns null on a network error", async () => {
    const fetcher = make(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await fetcher("https://shop.test/")).toBeNull();
  });

  describe("hosts and schemes", () => {
    it("never calls fetch for a host the page does not use", async () => {
      const impl = vi.fn(async () => respond());
      const fetcher = make(impl);
      expect(await fetcher("http://169.254.169.254/latest/meta-data")).toBeNull();
      expect(await fetcher("http://localhost:5432/")).toBeNull();
      expect(await fetcher("https://evil.test/")).toBeNull();
      expect(impl).not.toHaveBeenCalled();
    });

    it("matches hosts case-insensitively and ignores the port", async () => {
      const impl = vi.fn(async () => respond());
      await make(impl)("https://SHOP.test:8443/x");
      expect(impl).toHaveBeenCalledTimes(1);
    });

    it.each(["file:///etc/passwd", "data:text/plain,hi", "ftp://shop.test/x", "not a url"])("blocks %s", async (url) => {
      const impl = vi.fn(async () => respond());
      expect(await make(impl)(url)).toBeNull();
      expect(impl).not.toHaveBeenCalled();
    });
  });

  describe("redirects", () => {
    it("follows a same-host redirect", async () => {
      const impl = vi.fn(async (url: string) =>
        url.endsWith("/old") ? respond(301, "", { location: "/new" }) : respond(200, "new page"),
      );
      const result = await make(impl)("https://shop.test/old");
      expect(result).toMatchObject({ status: 200, body: "new page", url: "https://shop.test/new" });
      expect(impl).toHaveBeenCalledTimes(2);
    });

    it("follows http to https on the same host", async () => {
      const impl = vi.fn(async (url: string) =>
        url.startsWith("http:") ? respond(308, "", { location: "https://shop.test/" }) : respond(200),
      );
      expect(await make(impl)("http://shop.test/")).toMatchObject({ status: 200, url: "https://shop.test/" });
    });

    it("does not follow a redirect to another host and hands back the 3xx", async () => {
      const impl = vi.fn(async () => respond(302, "", { location: "https://evil.test/steal" }));
      const result = await make(impl)("https://shop.test/");
      expect(result).toMatchObject({ status: 302, headers: expect.objectContaining({ location: "https://evil.test/steal" }) });
      expect(impl).toHaveBeenCalledTimes(1);
    });

    it("does not follow redirects when asked not to", async () => {
      const impl = vi.fn(async () => respond(301, "", { location: "https://shop.test/" }));
      const result = await make(impl)("http://shop.test/", { followRedirects: false });
      expect(result?.status).toBe(301);
      expect(impl).toHaveBeenCalledTimes(1);
    });

    it("gives up after 3 redirects", async () => {
      const impl = vi.fn(async () => respond(302, "", { location: "/again" }));
      expect(await make(impl)("https://shop.test/")).toBeNull();
      expect(impl).toHaveBeenCalledTimes(4); // the first request plus 3 followed redirects
    });
  });

  describe("body cap", () => {
    it("cuts the body at maxBytes and says so", async () => {
      const result = await make(async () => respond(200, "a".repeat(100)))("https://shop.test/", { maxBytes: 10 });
      expect(result).toMatchObject({ body: "a".repeat(10), truncated: true });
    });

    it("does not mark a body that fits as truncated", async () => {
      const result = await make(async () => respond(200, "a".repeat(10)))("https://shop.test/", { maxBytes: 10 });
      expect(result).toMatchObject({ body: "a".repeat(10), truncated: false });
    });
  });
});
