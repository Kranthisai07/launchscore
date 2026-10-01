import { metaTags } from "../html.js";
import type { Check, Finding } from "../types.js";

// "none" is the same as "noindex, nofollow".
const blocksIndexing = (directives: string): boolean =>
  directives
    .toLowerCase()
    .split(/[,\s]+/)
    .some((token) => token === "noindex" || token === "none");

const robotsMeta = (html: string): string[] =>
  metaTags(html)
    .filter((t) => t.name === "robots")
    .map((t) => t.content);

export const seo004: Check = {
  id: "SEO-004",
  title: "Accidental noindex",
  category: "seo",
  mode: "passive",
  async run(ctx) {
    const found: string[] = [];
    const inRaw = robotsMeta(ctx.rawHtml).some(blocksIndexing);
    if (inRaw) found.push('a robots meta tag in your page ("noindex")');
    if (!inRaw && robotsMeta(ctx.html).some(blocksIndexing)) found.push("a robots meta tag added by JavaScript");
    // Header values can name a bot first ("googlebot: noindex"): any noindex counts.
    if (blocksIndexing((ctx.headers["x-robots-tag"] ?? "").replace(/^[^:]*:/, ""))) {
      found.push("an X-Robots-Tag header sent by your server");
    }
    if (found.length === 0) return [];

    const finding: Finding = {
      checkId: "SEO-004",
      severity: "high",
      title: "Your page tells Google not to list it in search results (noindex)",
      why: "Your site will not appear in Google, which usually means no visitors from search.",
      evidence: `Found ${found.join(" and ")}`,
      fix: "Remove the noindex setting (often left on from development) and redeploy; if you are not sure where it comes from, check your hosting and framework SEO settings.",
    };
    return [finding];
  },
};
