import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createHyg004, hyg004 } from "../../src/checks/hyg-004.js";
import { DEFAULT_FAVICONS } from "../../src/data/default-favicons.js";
import type { FetchResult } from "../../src/fetcher.js";
import { fetched, makeContext, page, routedFetch } from "../helpers/context.js";

const sha = (bytes: Buffer | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const viteSvg = readFileSync(new URL("../../fixtures/bad/site/vite.svg", import.meta.url));

const image = (bytes: Buffer, type = "image/x-icon"): FetchResult => ({
  url: "",
  status: 200,
  headers: { "content-type": type },
  body: bytes.toString("utf8"),
  bytes,
  truncated: false,
});
const CUSTOM = image(Buffer.from([0, 0, 1, 0, 1, 0, 16, 16, 9, 9, 9]));
const HOME_PAGE = fetched(200, "<!doctype html><html><body>Home</body></html>", { "content-type": "text/html" });

const iconLink = (href: string, rel = "icon") => `<link rel="${rel}" href="${href}">`;
const run = (head: string, routes: Record<string, FetchResult | null>, check = hyg004) => {
  const fetch = routedFetch(routes);
  return check.run(makeContext({ url: "https://shop.test/", html: page(head), fetch })).then((findings) => ({ findings, fetch }));
};

describe("the default favicon table", () => {
  it("has well-formed, unique entries, each with a source", () => {
    expect(DEFAULT_FAVICONS.length).toBeGreaterThanOrEqual(9);
    for (const entry of DEFAULT_FAVICONS) {
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.framework.length).toBeGreaterThan(2);
      expect(entry.source).toMatch(/\//);
    }
    expect(new Set(DEFAULT_FAVICONS.map((e) => e.sha256)).size).toBe(DEFAULT_FAVICONS.length);
  });

  it("covers the frameworks whose hashes were verified from their template repositories", () => {
    const names = new Set(DEFAULT_FAVICONS.map((e) => e.framework));
    for (const name of ["Vite", "Next.js", "Create React App", "Astro", "Nuxt", "Angular"]) expect(names.has(name)).toBe(true);
  });

  it("matches the real classic Vite logo that the bad fixture ships", () => {
    expect(viteSvg.length).toBe(1497);
    expect(DEFAULT_FAVICONS.find((e) => e.sha256 === sha(viteSvg))?.framework).toBe("Vite");
  });

  it("does not match the good fixture's own icon", () => {
    const own = readFileSync(new URL("../../fixtures/good/site/favicon.svg", import.meta.url));
    expect(DEFAULT_FAVICONS.some((e) => e.sha256 === sha(own))).toBe(false);
  });
});

describe("HYG-004 default icons", () => {
  it("flags the real classic Vite logo (by content, not by file name)", async () => {
    const { findings } = await run(iconLink("/vite.svg"), { "https://shop.test/vite.svg": image(viteSvg, "image/svg+xml") });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "HYG-004", severity: "low" });
    expect(findings[0].title).toContain("default Vite icon");
    expect(findings[0].evidence).toBe("/vite.svg is the unchanged Vite starter icon");
  });

  it("flags the same bytes under a different file name", async () => {
    const { findings } = await run(iconLink("/img/logo-small.png"), { "https://shop.test/img/logo-small.png": image(viteSvg) });
    expect(findings).toHaveLength(1);
  });

  it("ignores a custom icon, even one that is named like a template's", async () => {
    const { findings } = await run(iconLink("/vite.svg"), { "https://shop.test/vite.svg": CUSTOM });
    expect(findings).toEqual([]);
  });

  it("matches every entry of an injected table, by content", async () => {
    for (const framework of ["Next.js", "Create React App", "Astro"]) {
      const bytes = Buffer.from(`pretend ${framework} icon`);
      const check = createHyg004([{ framework, sha256: sha(bytes), source: "test" }]);
      const { findings } = await run(iconLink("/favicon.ico"), { "https://shop.test/favicon.ico": image(bytes) }, check);
      expect(findings[0].title).toContain(`default ${framework} icon`);
    }
  });

  it("checks apple-touch-icon links too", async () => {
    const { findings } = await run(iconLink("/touch.png", "apple-touch-icon"), { "https://shop.test/touch.png": image(viteSvg) });
    expect(findings).toHaveLength(1);
  });

  it("finds a default icon among several", async () => {
    const head = iconLink("/a.png") + iconLink("/b.svg") + iconLink("/c.ico", "shortcut icon");
    const { findings } = await run(head, {
      "https://shop.test/a.png": CUSTOM,
      "https://shop.test/b.svg": image(viteSvg),
      "https://shop.test/c.ico": CUSTOM,
    });
    expect(findings).toHaveLength(1);
  });

  it("does not hash a body that was cut at the size cap", async () => {
    const cut = { ...image(viteSvg), truncated: true };
    const { findings } = await run(iconLink("/vite.svg"), { "https://shop.test/vite.svg": cut });
    expect(findings).toEqual([]);
  });

  it("resolves relative and absolute icon addresses against the final page", async () => {
    const { fetch } = await run(iconLink("icons/a.png") + iconLink("//cdn.shop.test/b.png") + iconLink("https://shop.test/c.png"), {});
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      "https://shop.test/icons/a.png",
      "https://cdn.shop.test/b.png",
      "https://shop.test/c.png",
    ]);
  });

  it("fetches at most four icons", async () => {
    const head = Array.from({ length: 7 }, (_, i) => iconLink(`/${i}.png`)).join("");
    const { fetch } = await run(head, {});
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});

describe("HYG-004 missing icons", () => {
  it("reports no icon link and no /favicon.ico (404)", async () => {
    const { findings, fetch } = await run("", { "https://shop.test/favicon.ico": fetched(404) });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "low", title: "Your site has no icon in the browser tab (favicon)" });
    expect(fetch.mock.calls[0][0]).toBe("https://shop.test/favicon.ico");
  });

  it.each([
    ["410", fetched(410)],
    ["a soft 404 (the home page with status 200)", HOME_PAGE],
  ])("reports no icon link and /favicon.ico answering %s", async (_name, response) => {
    const { findings } = await run("", { "https://shop.test/favicon.ico": response });
    expect(findings).toHaveLength(1);
  });

  it("accepts a real /favicon.ico when the page declares no icon", async () => {
    const { findings } = await run("", { "https://shop.test/favicon.ico": CUSTOM });
    expect(findings).toEqual([]);
  });

  it.each([
    ["a server error", fetched(500)],
    ["a forbidden response", fetched(403)],
    ["a failed request", null],
  ])("reports nothing when /favicon.ico gives %s", async (_name, response) => {
    expect((await run("", { "https://shop.test/favicon.ico": response })).findings).toEqual([]);
  });

  it("reports an icon link whose file is missing", async () => {
    const { findings } = await run(iconLink("/icon.png"), { "https://shop.test/icon.png": fetched(404) });
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain("does not exist");
    expect(findings[0].evidence).toBe("/icon.png not found");
  });

  it("does not report when at least one declared icon exists", async () => {
    const head = iconLink("/a.png") + iconLink("/b.png");
    const { findings } = await run(head, { "https://shop.test/a.png": fetched(404), "https://shop.test/b.png": CUSTOM });
    expect(findings).toEqual([]);
  });

  it("does not report a declared icon when the request failed", async () => {
    expect((await run(iconLink("/a.png"), { "https://shop.test/a.png": null })).findings).toEqual([]);
  });

  it("treats an icon embedded as a data: address as present", async () => {
    const { findings } = await run(iconLink("data:image/svg+xml,%3Csvg%3E%3C/svg%3E"), {});
    expect(findings).toEqual([]);
  });

  it("does not fetch /favicon.ico when an icon is declared", async () => {
    const { fetch } = await run(iconLink("/x.png"), { "https://shop.test/x.png": CUSTOM });
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(["https://shop.test/x.png"]);
  });
});
