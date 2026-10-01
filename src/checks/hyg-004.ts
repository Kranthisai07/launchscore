import { createHash } from "node:crypto";
import { DEFAULT_FAVICONS, type DefaultFavicon } from "../data/default-favicons.js";
import type { FetchResult } from "../fetcher.js";
import { linkRels } from "../html.js";
import type { Check, Finding } from "../types.js";

const MAX_ICONS = 4;
const MAX_ICON_BYTES = 512 * 1024;

type State = "present" | "missing" | "unknown";

const looksLikeHtml = (res: FetchResult): boolean =>
  (res.headers["content-type"] ?? "").toLowerCase().includes("text/html") || /^\s*<(!doctype|html|head|body)\b/i.test(res.body);

// A 200 that is really a web page counts as missing: many apps answer every path with their home page.
function stateOf(res: FetchResult | null): State {
  if (res === null) return "unknown";
  if (res.status === 404 || res.status === 410) return "missing";
  if (res.status === 200) return looksLikeHtml(res) ? "missing" : "present";
  return "unknown";
}

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

const low = (title: string, why: string, evidence: string, fix: string): Finding => ({
  checkId: "HYG-004",
  severity: "low",
  title,
  why,
  evidence,
  fix,
});

export function createHyg004(known: DefaultFavicon[] = DEFAULT_FAVICONS): Check {
  return {
    id: "HYG-004",
    title: "Favicon",
    category: "hygiene",
    mode: "passive",
    async run(ctx) {
      const links = linkRels(ctx.html).filter((l) => l.href !== "" && (l.rels.includes("icon") || l.rels.includes("apple-touch-icon")));
      const inline = links.some((l) => l.href.startsWith("data:")); // an icon embedded in the page itself
      const urls: string[] = [];
      for (const link of links) {
        try {
          const url = new URL(link.href, ctx.finalUrl);
          if ((url.protocol === "http:" || url.protocol === "https:") && !urls.includes(url.href)) urls.push(url.href);
        } catch {
          // an unusable href: ignore it
        }
      }
      const declared = links.length > 0;
      const candidates = declared ? urls.slice(0, MAX_ICONS) : [new URL("/favicon.ico", ctx.finalUrl).href];

      const results = await Promise.all(candidates.map((url) => ctx.fetch(url, { maxBytes: MAX_ICON_BYTES })));

      // Still the starter template's icon?
      for (const [index, res] of results.entries()) {
        if (res === null || stateOf(res) !== "present" || res.truncated) continue;
        const hash = sha256(res.bytes);
        const match = known.find((d) => d.sha256 === hash);
        if (match) {
          return [
            low(
              `Your site still uses the default ${match.framework} icon in the browser tab (favicon)`,
              "A stock icon makes the site look unfinished and unbranded, and it is easy to confuse with other sites built the same way.",
              `${pathOf(candidates[index])} is the unchanged ${match.framework} starter icon`,
              "Replace it with your own logo, as a small square image saved as favicon.ico or favicon.svg.",
            ),
          ];
        }
      }

      const states = results.map(stateOf);
      if (!declared && states[0] === "missing") {
        return [
          low(
            "Your site has no icon in the browser tab (favicon)",
            "Browsers show a blank or generic icon, and visitors have a harder time finding your tab or bookmark.",
            `No icon link on the page, and ${pathOf(candidates[0])} was not found`,
            "Add a small square logo as favicon.ico (or a link to one in the page head).",
          ),
        ];
      }
      if (declared && !inline && states.length > 0 && states.every((s) => s === "missing")) {
        return [
          low(
            "The icon your page points to (favicon) does not exist",
            "Browsers show a blank or generic icon in the tab.",
            `${candidates.map(pathOf).join(", ")} not found`,
            "Upload the icon file, or fix the address in the icon link in your page head.",
          ),
        ];
      }
      return [];
    },
  };
}

export const hyg004: Check = createHyg004();
