import { getMetaContent, getTitle, metaTags } from "../html.js";
import type { Check, Finding } from "../types.js";

// What a new Lovable project ships with. Seen unchanged on live Lovable sites (title, description, author and
// twitter:site on every one that was never edited; the preview image address ends in a short code that varies).
const DEFAULT_TITLE = "Lovable App";
const DEFAULT_DESCRIPTION = "Lovable Generated Project";
const DEFAULT_IMAGE_PREFIX = "https://lovable.dev/opengraph-image-";
const DEFAULT_TWITTER_SITE = "@Lovable";
const DEFAULT_AUTHOR = "Lovable";

export const seo006: Check = {
  id: "SEO-006",
  title: "Default platform metadata",
  category: "seo",
  mode: "passive",
  async run(ctx) {
    // Title, description and author as a browser or Google renders them; the preview image and X handle as
    // preview bots read them (the HTML as served, no JavaScript).
    const strong: string[] = [];
    const weak: string[] = [];
    if (getTitle(ctx.html) === DEFAULT_TITLE) strong.push(`title "${DEFAULT_TITLE}"`);
    if (getMetaContent(ctx.html, "description") === DEFAULT_DESCRIPTION) strong.push(`description "${DEFAULT_DESCRIPTION}"`);
    if (getOgImage(ctx.rawHtml).startsWith(DEFAULT_IMAGE_PREFIX)) strong.push("link preview image (Lovable's default picture)");
    if (getMetaContent(ctx.rawHtml, "twitter:site") === DEFAULT_TWITTER_SITE) weak.push(`X account "${DEFAULT_TWITTER_SITE}"`);
    if (getMetaContent(ctx.html, "author") === DEFAULT_AUTHOR) weak.push(`author "${DEFAULT_AUTHOR}"`);

    const left = [...strong, ...weak];
    if (left.length === 0) return [];
    const finding: Finding = {
      checkId: "SEO-006",
      // The title, description and preview image are what search results and shared links show; the author and
      // X account are only a small credit line.
      severity: strong.length > 0 ? "medium" : "low",
      title: "Your page still has the default settings your site builder (Lovable) put in",
      why: "Search results and shared links show generic Lovable text and pictures instead of your own, and the site looks unfinished.",
      evidence: `Still default: ${left.join(", ")}`,
      fix: "Replace them with your own title, description, preview image, author and X account (in your project's index.html or its SEO settings).",
    };
    return [finding];
  },
};

const getOgImage = (html: string): string => metaTags(html).find((t) => t.property === "og:image" && t.content !== "")?.content ?? "";
