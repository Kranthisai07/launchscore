import { vi } from "vitest";
import type { PageContext } from "../../src/context.js";
import type { FetchResult, PageFetch } from "../../src/fetcher.js";

// A mock page context for unit tests. Pass only what the check under test reads.
export function makeContext(overrides: Partial<PageContext> = {}): PageContext {
  const url = overrides.url ?? "https://shop.test/";
  return {
    url,
    finalUrl: url,
    status: 200,
    headers: {},
    rawHtml: "",
    html: "",
    scripts: [],
    skippedScripts: [],
    consoleErrors: [],
    links: [],
    fetch: async () => null, // unit tests never touch the network
    notTested: [],
    ...overrides,
  };
}

export const page = (head: string, body = ""): string =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

export const fetched = (status: number, body = "", headers: Record<string, string> = {}, truncated = false): FetchResult => ({
  url: "",
  status,
  headers,
  body,
  truncated,
});

// A mock ctx.fetch: exact URL -> result. Anything else is null (blocked or failed). Records every call.
export function routedFetch(routes: Record<string, FetchResult | null>) {
  return vi.fn<PageFetch>(async (url) => routes[url] ?? null);
}
