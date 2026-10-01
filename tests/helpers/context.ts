import type { PageContext } from "../../src/context.js";

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
    ...overrides,
  };
}

export const page = (head: string, body = ""): string =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
