import { isUnderHostingSuffix } from "../data/hosting-suffixes.js";
import { isHstsPreloadedTld } from "../data/hsts-preloaded-tlds.js";
import type { FetchResult } from "../fetcher.js";
import type { Check } from "../types.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function redirectsToHttps(res: FetchResult, from: string): boolean {
  const location = res.headers["location"];
  if (!REDIRECT_STATUSES.has(res.status) || !location) return false;
  try {
    return new URL(location, from).protocol === "https:";
  } catch {
    return false;
  }
}

export const sec004: Check = {
  id: "SEC-004",
  title: "Secure connection (HTTPS)",
  category: "security",
  mode: "passive",
  async run(ctx) {
    const final = new URL(ctx.finalUrl);
    if (LOCAL_HOSTS.has(final.hostname)) return [];
    // Browsers upgrade every http:// address under these top-level domains (.dev, .app, ...) to https themselves.
    if (isHstsPreloadedTld(final.hostname)) return [];

    if (final.protocol === "http:") {
      return [
        {
          checkId: "SEC-004",
          severity: "high",
          title: "Your site loads without a secure connection (no HTTPS)",
          why: "Anyone on the same network can read or change what your visitors send and see, including passwords.",
          evidence: `The page finished loading at ${ctx.finalUrl}`,
          fix: "Turn on HTTPS in your hosting settings (most hosts offer it for free) and send all visitors to the https:// address.",
        },
      ];
    }

    // Visitors who type the bare address land on http first: it must send them to https.
    if (new URL(ctx.url).protocol !== "https:" || final.port !== "") return [];
    const httpUrl = `http://${final.host}${final.pathname}${final.search}`;
    // The first response only: we are checking whether it redirects, so it must not be followed.
    const res = await ctx.fetch(httpUrl, { followRedirects: false });
    if (res === null) return []; // refusing plain http is fine, and a failed request is not proof of a problem
    if (redirectsToHttps(res, httpUrl)) return [];
    // On a shared hosting platform (bolt.host, lovable.app, ...) the site owner usually has no redirect setting to
    // turn on: the platform decides, so the advice is different.
    const fix = isUnderHostingSuffix(final.hostname)
      ? `Your host (${final.hostname}) serves the http:// address without sending visitors to https://. Check the https setting in your host's dashboard, or connect your own domain and turn on https there.`
      : "In your hosting settings, turn on the option that redirects http:// visitors to https://.";
    return [
      {
        checkId: "SEC-004",
        severity: "medium",
        title: "Visitors who type your address without https are not sent to the secure version",
        why: "People using the plain http:// address stay on an unprotected connection.",
        evidence: `${httpUrl} answered with status ${res.status} and no redirect to https`,
        fix,
      },
    ];
  },
};
