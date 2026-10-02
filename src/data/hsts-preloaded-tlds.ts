// Top-level domains that browsers force onto https themselves (HSTS preload with includeSubdomains), so every
// name under them is upgraded from http:// to https:// before any request leaves the browser.
//
// Source: Chromium's HSTS preload list,
// https://source.chromium.org/chromium/chromium/src/+/main:net/http/transport_security_state_static.json
// (raw: https://raw.githubusercontent.com/chromium/chromium/main/net/http/transport_security_state_static.json)
// at commit d5e6fd51b430fec89732a3976e666011ecffa0a2 (2026-09-11).
// Derived by parsing that file and keeping the entries whose name has no dot (a whole TLD): 51 of 94,778 entries,
// all with policy "public-suffix", mode "force-https" and include_subdomains true. Nothing is added by hand.
export const HSTS_PRELOADED_TLDS: ReadonlySet<string> = new Set([
  "android", "app", "bank", "chrome", "dev", "foo", "gle", "gmail", "google", "hangout", "insurance", "meet", "new",
  "page", "play", "search", "youtube", "esq", "fly", "rsvp", "eat", "nexus", "ing", "meme", "phd", "prof", "boo",
  "dad", "day", "channel", "hotmail", "mov", "zip", "windows", "skype", "azure", "office", "bing", "xbox",
  "microsoft", "amazon", "audible", "fire", "imdb", "kindle", "prime", "silk", "zappos", "xn--cckwcxetd",
  "xn--jlq480n2rg", "fujitsu",
]);

const IP_ADDRESS = /^\d+(\.\d+){3}$|:/;

export function isHstsPreloadedTld(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "" || IP_ADDRESS.test(host) || !host.includes(".")) return false;
  return HSTS_PRELOADED_TLDS.has(host.slice(host.lastIndexOf(".") + 1));
}
