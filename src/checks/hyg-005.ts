import type { ConsoleError } from "../context.js";
import { scrubSecrets } from "./sec-001.js";
import type { Check, Severity } from "../types.js";

const MAX_MESSAGE = 160;
const FAVICON_REQUEST = /(?:^|\/)(?:favicon[^/]*\.(?:ico|png|svg)|apple-touch-icon[^/]*)$/i;
const EXTENSION = /^(?:chrome|moz|safari|edge)-extension:/i;

function urlOf(value: string | undefined): URL | undefined {
  try {
    return value ? new URL(value) : undefined;
  } catch {
    return undefined;
  }
}

// Not the site's own doing: a missing favicon, or something a browser extension logged.
function isNoise(error: ConsoleError): boolean {
  if (/-extension:\/\//i.test(error.text) || /ERR_BLOCKED_BY_CLIENT/.test(error.text)) return true;
  if (!error.url) return false;
  if (EXTENSION.test(error.url)) return true;
  const url = urlOf(error.url);
  return url !== undefined && FAVICON_REQUEST.test(url.pathname);
}

const bareHost = (host: string): string => host.replace(/^www\./, "").toLowerCase();

// The site itself: same host, or a subdomain of it (or the other way round).
function isFirstParty(source: URL, site: URL): boolean {
  const a = bareHost(source.hostname);
  const b = bareHost(site.hostname);
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

export const hyg005: Check = {
  id: "HYG-005",
  title: "Console errors",
  category: "hygiene",
  mode: "passive",
  async run(ctx) {
    const errors = ctx.consoleErrors.filter((e) => !isNoise(e));
    if (errors.length === 0) return [];

    const site = new URL(ctx.finalUrl);
    // An error whose source is unknown counts as another site's: when unsure, report it lower.
    const own = errors.filter((e) => {
      const source = urlOf(e.url);
      return source !== undefined && isFirstParty(source, site);
    });
    const severity: Severity = own.length > 0 ? "medium" : "low";
    const first = own[0] ?? errors[0];
    const source = urlOf(first.url);

    const message = scrubSecrets(first.text).replace(/\s+/g, " ").trim();
    const shown = message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE)}…` : message;
    const where = !source ? "" : own.includes(first) ? ` (in ${source.pathname})` : ` (from ${source.hostname})`;

    return [
      {
        checkId: "HYG-005",
        severity,
        title: "Your page shows errors behind the scenes (in the browser console, a log only developers normally see)",
        why:
          severity === "medium"
            ? "Something on your own site is failing as the page loads, so part of it may not work for visitors."
            : "Scripts from other sites are failing as your page loads, which can slow it down or break parts of it.",
        evidence: `${errors.length} error${errors.length === 1 ? "" : "s"}, first: ${shown}${where}`,
        fix: "Open your site in a browser, press F12, look at the Console tab, and fix or remove whatever is causing the first red error.",
      },
    ];
  },
};
