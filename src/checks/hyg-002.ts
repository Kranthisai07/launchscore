import { anchors } from "../html.js";
import type { Check } from "../types.js";

// Link text as a whole word, or a path segment such as /terms, /terms-of-service or /tos.
const TEXT = /\bterms\b|\btos\b|\bagb\b|nutzungsbedingungen|conditions g[ée]n[ée]rales|t[ée]rminos/i;
const PATH = /(?:^|[/_-])(?:terms|tos|agb|nutzungsbedingungen|terminos)(?:[/_.-]|$)/i;

function pathOf(href: string): string {
  try {
    return decodeURIComponent(new URL(href, "http://site.invalid/").pathname);
  } catch {
    return href;
  }
}

export const hyg002: Check = {
  id: "HYG-002",
  title: "Terms of service link",
  category: "hygiene",
  mode: "passive",
  async run(ctx) {
    const found = anchors(ctx.html).some((a) => TEXT.test(a.text) || PATH.test(pathOf(a.href)));
    if (found) return [];
    return [
      {
        checkId: "HYG-002",
        severity: "low",
        title: "Your site has no terms of service link",
        why: "Without terms, you have little protection if a visitor misuses your service or disputes a purchase.",
        evidence: "No link to terms found (looked for terms, terms of service, /terms, /tos)",
        fix: "Add a terms of service page and link to it from your footer.",
      },
    ];
  },
};
