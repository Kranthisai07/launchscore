import { linkRels, withoutHidden } from "../html.js";
import type { Check, Finding } from "../types.js";

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

    const hasCanonical = linkRels(ctx.html).some((l) => l.rels.includes("canonical") && l.href !== "");
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
