import type { PageContext } from "../context.js";
import type { Check, Finding } from "../types.js";

const MAX_MAPS = 20;
const MAX_MAP_BYTES = 10 * 1024 * 1024;

// Only a comment on its own line counts, so library code that merely mentions the phrase does not.
const COMMENT = /^\s*\/\/[#@]\s*sourceMappingURL=(\S+)\s*$/gm;

function referencedMap(script: PageContext["scripts"][number]): string | undefined {
  const matches = [...script.body.matchAll(COMMENT)];
  return matches.length > 0 ? matches[matches.length - 1][1] : (script.headers?.["sourcemap"] ?? script.headers?.["x-sourcemap"]);
}

// A map only matters when it ships the original source (sourcesContent).
function hasSource(text: string, truncated: boolean): boolean {
  try {
    const map: unknown = JSON.parse(text);
    const content = typeof map === "object" && map !== null ? (map as { sourcesContent?: unknown }).sourcesContent : undefined;
    return Array.isArray(content) && content.some((entry) => typeof entry === "string" && entry.trim() !== "");
  } catch {
    return truncated && /"sourcesContent"\s*:\s*\[\s*"/.test(text);
  }
}

const withoutQuery = (url: URL): string => url.origin + url.pathname;

export const sec002: Check = {
  id: "SEC-002",
  title: "Public source maps",
  category: "security",
  mode: "passive",
  async run(ctx) {
    const mapUrls: URL[] = [];
    const inline: string[] = [];
    const seen = new Set<string>();

    for (const script of ctx.scripts) {
      const ref = referencedMap(script);
      if (!ref) continue;
      if (ref.startsWith("data:")) {
        // The map is inside the script itself: no request needed.
        const match = /^data:application\/json[^,]*?(;base64)?,(.*)$/s.exec(ref);
        if (match) {
          const text = match[1] ? Buffer.from(match[2], "base64").toString("utf8") : decodeURIComponent(match[2]);
          if (hasSource(text, false)) inline.push(script.url);
        }
        continue;
      }
      let url: URL;
      try {
        url = new URL(ref, script.url);
      } catch {
        continue;
      }
      if ((url.protocol !== "http:" && url.protocol !== "https:") || seen.has(url.href)) continue;
      seen.add(url.href);
      mapUrls.push(url);
    }

    const checked = mapUrls.slice(0, MAX_MAPS);
    const exposed: string[] = inline.map((u) => `inline source map in ${withoutQuery(new URL(u))}`);
    const results = await Promise.all(
      checked.map(async (url) => {
        const res = await ctx.fetch(url.href, { maxBytes: MAX_MAP_BYTES });
        return res && res.status === 200 && hasSource(res.body, res.truncated) ? withoutQuery(url) : null;
      }),
    );
    exposed.push(...results.filter((r): r is string => r !== null));

    // Over the cap and nothing public among the ones we did check: say how many we never looked at.
    if (exposed.length === 0) {
      if (mapUrls.length > MAX_MAPS) {
        ctx.notTested.push({
          checkId: "SEC-002",
          title: "Public source maps",
          reason: `${mapUrls.length - MAX_MAPS} source maps not checked (limit ${MAX_MAPS})`,
        });
      }
      return [];
    }
    const more = exposed.length > 1 ? ` and ${exposed.length - 1} more` : "";
    const finding: Finding = {
      checkId: "SEC-002",
      severity: "medium",
      title: "Your website's original source code can be downloaded by anyone (public source maps)",
      why: "A source map is a file that lets a browser show your original code, so anyone can read your code, comments and logic.",
      evidence: `${exposed[0]}${more}`,
      fix: "Turn off source maps for production in your build settings (usually sourcemap: false), then redeploy.",
    };
    return [finding];
  },
};
