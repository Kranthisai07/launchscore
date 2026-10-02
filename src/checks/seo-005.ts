import { isUnderHostingSuffix } from "../data/hosting-suffixes.js";
import { isPlaceholderHostname } from "../data/placeholder-hosts.js";
import { linkRels, withoutHidden } from "../html.js";
import { isSameSite } from "../site.js";
import type { Check, Finding } from "../types.js";

// True when the canonical points at another site than the page, except a preview copy on a hosting platform's
// default address (bolt.host, lovable.app, ...) pointing at the owner's own domain: that is correct practice.
function wrongSite(href: string, pageUrl: string): boolean {
  let canonicalHost: string;
  const pageHost = new URL(pageUrl).hostname;
  try {
    canonicalHost = new URL(href, pageUrl).hostname;
  } catch {
    return false;
  }
  if (isPlaceholderHostname(canonicalHost)) return true;
  if (isSameSite(pageHost, canonicalHost)) return false;
  if (isUnderHostingSuffix(pageHost) && !isUnderHostingSuffix(canonicalHost)) return false;
  return true;
}

// Several h1s are fine (HTML5 and Google allow them), so only a missing one is reported.
export const seo005: Check = {
  id: "SEO-005",
  title: "Main heading and canonical link",
  category: "seo",
  mode: "passive",
  async run(ctx) {
    const markup = withoutHidden(ctx.html);
    const findings: Finding[] = [];

    if (!/<h1[\s>]/i.test(markup)) {
      findings.push({
        checkId: "SEO-005",
        severity: "low",
        title: "Your page has no main heading (h1)",
        why: "Search engines and screen readers use the main heading to understand what the page is about.",
        evidence: "No h1 element found on the page",
        fix: "Add one h1 heading that says what the page is about.",
      });
    }

    const canonical = linkRels(ctx.html).find((l) => l.rels.includes("canonical") && l.href !== "");
    const hasCanonical = canonical !== undefined;
    if (canonical && wrongSite(canonical.href, ctx.finalUrl)) {
      findings.push({
        checkId: "SEO-005",
        severity: "medium",
        title: "Your page's canonical link points to a different website (a tag that tells Google which address is the main one)",
        why: "Google may drop your page from search results in favour of the other address, so your own site does not rank.",
        evidence: `Canonical is ${canonical.href.slice(0, 120)} but the page is on ${new URL(ctx.finalUrl).hostname}`,
        fix: 'Change <link rel="canonical"> to the real address of this page on your own domain.',
      });
    }
    if (!hasCanonical) {
      findings.push({
        checkId: "SEO-005",
        severity: "low",
        title: "Your page has no canonical link (a tag that tells Google which address is the main one)",
        why: "Google may treat the same page at slightly different addresses as separate copies and split your ranking between them.",
        evidence: 'No <link rel="canonical"> found on the page',
        fix: 'Add <link rel="canonical" href="https://yoursite.com/this-page"> to the head of the page, using its real address.',
      });
    }

    return findings;
  },
};
