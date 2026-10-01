import { metaTags } from "../html.js";
import type { Check, Finding } from "../types.js";

const OG_TAGS = ["og:title", "og:description", "og:image"] as const;

interface Present {
  og: Record<string, string>; // property -> content (non-empty only)
  twitterCard: string;
}

function readTags(html: string): Present {
  const og: Record<string, string> = {};
  let twitterCard = "";
  for (const tag of metaTags(html)) {
    if (tag.content === "") continue;
    if (tag.property && (OG_TAGS as readonly string[]).includes(tag.property)) og[tag.property] ??= tag.content;
    if (tag.name === "twitter:card" || tag.property === "twitter:card") twitterCard ||= tag.content;
  }
  return { og, twitterCard };
}

const finding = (severity: Finding["severity"], title: string, why: string, evidence: string, fix: string): Finding => ({
  checkId: "SEO-002",
  severity,
  title,
  why,
  evidence,
  fix,
});

const list = (items: string[]): string => items.join(", ");

export const seo002: Check = {
  id: "SEO-002",
  title: "Social preview tags",
  category: "seo",
  mode: "passive",
  async run(ctx) {
    // Preview bots read the HTML as served and do not run JavaScript, so raw HTML is the truth.
    const raw = readTags(ctx.rawHtml);
    const rendered = readTags(ctx.html);
    const findings: Finding[] = [];

    const ogMissingEverywhere = OG_TAGS.filter((t) => !raw.og[t] && !rendered.og[t]);
    const ogJsOnly = OG_TAGS.filter((t) => !raw.og[t] && rendered.og[t]);

    if (ogMissingEverywhere.length > 0) {
      findings.push(
        finding(
          "medium",
          "Your page is missing social preview tags (Open Graph tags that control how your link looks when shared)",
          "Links to your site will look plain or empty when shared on X, LinkedIn, WhatsApp and Slack.",
          `Missing: ${list(ogMissingEverywhere)}`,
          "Add the missing tags to your page's head: a title, a description and a full image address.",
        ),
      );
    }

    const twitterJsOnly = !raw.twitterCard && rendered.twitterCard !== "";
    // One finding covers every tag that only JavaScript adds; a lone twitter:card is handled below.
    const jsOnly: string[] = [...ogJsOnly, ...(twitterJsOnly ? ["twitter:card"] : [])];

    if (ogJsOnly.length > 0) {
      findings.push(
        finding(
          "medium",
          "Your link previews will be blank on X, LinkedIn and WhatsApp because these tags are added by JavaScript, which preview bots don't run",
          "People who share your link will see no title, description or image.",
          `Only added by JavaScript: ${list(jsOnly)}`,
          "Put the tags directly in your page's HTML instead of adding them with JavaScript (use your framework's server-side head or metadata feature).",
        ),
      );
    }

    if (!raw.twitterCard && !(twitterJsOnly && ogJsOnly.length > 0)) {
      const jsOnly = twitterJsOnly;
      findings.push(
        finding(
          "low",
          jsOnly
            ? "Your X (Twitter) card tag is added by JavaScript, so X's preview bot cannot see it"
            : "Your page has no X (Twitter) card tag",
          "Links shared on X may show as a small plain link instead of a large preview.",
          jsOnly ? "twitter:card only added by JavaScript" : "Missing: twitter:card",
          'Add <meta name="twitter:card" content="summary_large_image"> to your page\'s HTML.',
        ),
      );
    }

    const image = raw.og["og:image"] ?? rendered.og["og:image"];
    if (image !== undefined && !/^https?:\/\//i.test(image)) {
      findings.push(
        finding(
          "low",
          "Your social preview image address is not a full web address",
          "Many sites and apps ignore relative image paths, so the image may not show up when your link is shared.",
          `og:image is "${image.slice(0, 100)}"`,
          "Use the full address, starting with https://, for the og:image tag.",
        ),
      );
    }

    return findings;
  },
};
