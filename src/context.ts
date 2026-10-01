import { AxeBuilder } from "@axe-core/playwright";
import { AXE_TAGS, summarizeAxe, type AxeOutcome } from "./axe.js";
import { chromium, type Response } from "playwright";
import { createFetcher, type PageFetch } from "./fetcher.js";
import type { Category, NotTested } from "./types.js";

// An error the page logged, with the address of the file it came from when the browser said.
export interface ConsoleError {
  text: string;
  url?: string;
}

export interface PageContext {
  url: string; // as requested
  finalUrl: string; // after redirects
  status: number; // main document status
  headers: Record<string, string>; // main document response, keys lowercased
  rawHtml: string; // main document body exactly as served
  html: string; // rendered DOM after load
  scripts: { url: string; body: string; headers?: Record<string, string> }[]; // headers lowercased
  skippedScripts: { url: string; reason: string }[]; // dropped by caps or unreadable
  consoleErrors: ConsoleError[];
  links: string[]; // same-origin <a href>, absolute, hash stripped, deduped
  // The only way checks request anything themselves: 5 at a time, 10 s timeout, same-host redirects,
  // and only to hosts this page already uses. Returns null when blocked or failed.
  fetch: PageFetch;
  // Checks add an entry when they could not look at everything (e.g. a cap was hit); the runner reports them.
  notTested: NotTested[];
  // Accessibility results from axe, run on the same page load (no second navigation).
  axe: AxeOutcome;
  // A check that measures a category directly (PERF-001) puts its 0 to 100 score here.
  categoryScores: Partial<Record<Category, number>>;
}

export interface ContextOptions {
  maxScriptBytes?: number;
  maxScripts?: number;
}

const DEFAULT_MAX_SCRIPT_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_SCRIPTS = 100;
const NAVIGATION_TIMEOUT_MS = 30_000;
const IDLE_TIMEOUT_MS = 5_000;
const AXE_TIMEOUT_MS = 30_000;

export async function buildContext(url: string, options: ContextOptions = {}): Promise<PageContext> {
  const maxScriptBytes = options.maxScriptBytes ?? DEFAULT_MAX_SCRIPT_BYTES;
  const maxScripts = options.maxScripts ?? DEFAULT_MAX_SCRIPTS;

  const browser = await chromium.launch();
  try {
    // axe needs a page that belongs to an explicit browser context.
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleErrors: ConsoleError[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push({ text: msg.text(), url: msg.location().url || undefined });
    });
    // An uncaught error names its file in the first line of the stack ("at ... http://host/app.js:13:1").
    page.on("pageerror", (err) =>
      consoleErrors.push({ text: err.message, url: /(https?:\/\/[^\s)]+?):\d+:\d+/.exec(err.stack ?? "")?.[1] }),
    );

    // Bodies are read after load so slow responses never block event handling.
    const scriptResponses: Response[] = [];
    page.on("response", (res) => {
      if (res.request().resourceType() === "script") scriptResponses.push(res);
    });

    let main: Response | null;
    try {
      main = await page.goto(url, { waitUntil: "load", timeout: NAVIGATION_TIMEOUT_MS });
    } catch (err) {
      throw new Error(`Could not load ${url}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    }
    if (main === null) throw new Error(`Could not load ${url}: no response`);

    // A page that never goes idle must not fail the scan.
    await page.waitForLoadState("networkidle", { timeout: IDLE_TIMEOUT_MS }).catch(() => undefined);

    const scripts: PageContext["scripts"] = [];
    const skippedScripts: PageContext["skippedScripts"] = [];
    const seen = new Set<string>();
    for (const res of scriptResponses) {
      const scriptUrl = res.url();
      if (seen.has(scriptUrl)) continue;
      seen.add(scriptUrl);
      if (scripts.length >= maxScripts) {
        skippedScripts.push({ url: scriptUrl, reason: "over script limit" });
        continue;
      }
      try {
        const body = await res.text();
        if (Buffer.byteLength(body) > maxScriptBytes) {
          skippedScripts.push({ url: scriptUrl, reason: "too large" });
        } else {
          scripts.push({ url: scriptUrl, body, headers: Object.fromEntries(Object.entries(res.headers()).map(([k, v]) => [k.toLowerCase(), v])) });
        }
      } catch {
        skippedScripts.push({ url: scriptUrl, reason: "unreadable" });
      }
    }

    const finalUrl = page.url();
    const origin = new URL(finalUrl).origin;
    const hrefs = await page.$$eval("a[href]", (anchors) => anchors.map((a) => (a as unknown as { href: string }).href));
    const links = [
      ...new Set(
        hrefs.flatMap((href) => {
          try {
            const link = new URL(href);
            if (link.origin !== origin) return [];
            link.hash = "";
            return [link.href];
          } catch {
            return [];
          }
        }),
      ),
    ];

    const rawHtml = await main.text();
    const html = await page.content();

    let axe: AxeOutcome;
    try {
      const results = await Promise.race([
        new AxeBuilder({ page }).withTags(AXE_TAGS).analyze(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("axe timed out")), AXE_TIMEOUT_MS).unref()),
      ]);
      axe = summarizeAxe(results);
    } catch (err) {
      axe = { error: err instanceof Error ? err.message.split("\n")[0] : String(err) };
    }

    const allowedHosts = new Set([new URL(finalUrl).hostname, ...scriptResponses.map((r) => new URL(r.url()).hostname)]);

    return {
      url,
      finalUrl,
      status: main.status(),
      headers: Object.fromEntries(Object.entries(main.headers()).map(([k, v]) => [k.toLowerCase(), v])),
      rawHtml,
      html,
      scripts,
      skippedScripts,
      consoleErrors,
      links,
      fetch: createFetcher({ allowedHosts }),
      notTested: [],
      axe,
      categoryScores: {},
    };
  } finally {
    await browser.close();
  }
}
