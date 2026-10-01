import { chromium, type Response } from "playwright";

export interface PageContext {
  url: string; // as requested
  finalUrl: string; // after redirects
  status: number; // main document status
  headers: Record<string, string>; // main document response, keys lowercased
  rawHtml: string; // main document body exactly as served
  html: string; // rendered DOM after load
  scripts: { url: string; body: string }[];
  skippedScripts: { url: string; reason: string }[]; // dropped by caps or unreadable
  consoleErrors: string[];
  links: string[]; // same-origin <a href>, absolute, hash stripped, deduped
}

export interface ContextOptions {
  maxScriptBytes?: number;
  maxScripts?: number;
}

const DEFAULT_MAX_SCRIPT_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_SCRIPTS = 100;
const NAVIGATION_TIMEOUT_MS = 30_000;
const IDLE_TIMEOUT_MS = 5_000;

export async function buildContext(url: string, options: ContextOptions = {}): Promise<PageContext> {
  const maxScriptBytes = options.maxScriptBytes ?? DEFAULT_MAX_SCRIPT_BYTES;
  const maxScripts = options.maxScripts ?? DEFAULT_MAX_SCRIPTS;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

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
          scripts.push({ url: scriptUrl, body });
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

    return {
      url,
      finalUrl,
      status: main.status(),
      headers: Object.fromEntries(Object.entries(main.headers()).map(([k, v]) => [k.toLowerCase(), v])),
      rawHtml: await main.text(),
      html: await page.content(),
      scripts,
      skippedScripts,
      consoleErrors,
      links,
    };
  } finally {
    await browser.close();
  }
}
