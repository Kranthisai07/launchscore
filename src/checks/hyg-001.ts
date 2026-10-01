import type { PageContext } from "../context.js";
import { anchors, withoutHidden } from "../html.js";
import { findAuthProviders } from "../stack.js";
import type { Check } from "../types.js";

// Matched on the link text and on the address path only, never on the domain name.
const PRIVACY = /privacy|datenschutz|confidentialit[eé]|privacidad/i;

function pathOf(href: string): string {
  try {
    return decodeURIComponent(new URL(href, "http://site.invalid/").pathname);
  } catch {
    return href;
  }
}

// Why we think this page collects personal details, or undefined when it looks like it does not.
function collectsData(ctx: PageContext): string | undefined {
  const html = withoutHidden(ctx.html);
  if (/<input\b[^>]*\btype\s*=\s*["']?password/i.test(html)) return "the page has a password field";
  for (const form of html.match(/<form\b[\s\S]*?<\/form>/gi) ?? []) {
    for (const input of form.match(/<input\b[^>]*>/gi) ?? []) {
      if (/\btype\s*=\s*["']?email\b/i.test(input) || /\b(?:name|id|autocomplete)\s*=\s*["'][^"']*email/i.test(input)) {
        return "a form on the page asks for an email address";
      }
    }
  }
  const providers = findAuthProviders(ctx);
  if (providers.length > 0) return `${providers.join(" and ")} detected (your site has accounts or stores data)`;
  return undefined;
}

export const hyg001: Check = {
  id: "HYG-001",
  title: "Privacy policy link",
  category: "hygiene",
  mode: "passive",
  async run(ctx) {
    const found = anchors(ctx.html).some((a) => PRIVACY.test(a.text) || PRIVACY.test(pathOf(a.href)));
    if (found) return [];

    const reason = collectsData(ctx);
    return [
      {
        checkId: "HYG-001",
        severity: reason ? "high" : "medium",
        title: "Your site has no privacy policy link",
        why: reason
          ? "Collecting personal details without telling people how you use them can break privacy laws and get you fined or blocked by payment and ad providers."
          : "Visitors, app stores and ad providers expect a privacy policy, and many privacy laws require one.",
        evidence: reason
          ? `No link to a privacy policy found, and ${reason}`
          : "No link to a privacy policy found (looked for privacy, datenschutz, confidentialité)",
        fix: "Add a privacy policy page (free generators exist) and link to it from your footer.",
      },
    ];
  },
};
