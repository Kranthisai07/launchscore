import { visibleText } from "../html.js";
import type { Check, Finding } from "../types.js";

interface Pattern {
  name: string;
  regex: RegExp;
}

// "Coming soon" is deliberately not here: it is often intentional.
const PATTERNS: Pattern[] = [
  { name: "Lorem ipsum", regex: /lorem ipsum/i },
  { name: "Your Company", regex: /your company/i },
  { name: "Company Name", regex: /company name/i },
  { name: "John Doe", regex: /john doe/i },
  { name: "Jane Doe", regex: /jane doe/i },
  { name: "an example.com or test.com email address", regex: /[\w.+-]+@(?:example|test)\.com\b/i },
];

const SNIPPET_RADIUS = 40;

// Evidence is a short piece of visible page text, not a secret, so it is not passed through redact().
function snippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + length + SNIPPET_RADIUS);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

export const hyg003: Check = {
  id: "HYG-003",
  title: "Placeholder content",
  category: "hygiene",
  mode: "passive",
  async run(ctx) {
    const text = visibleText(ctx.html);
    const findings: Finding[] = [];
    for (const { name, regex } of PATTERNS) {
      const match = regex.exec(text);
      if (!match) continue;
      findings.push({
        checkId: "HYG-003",
        severity: "medium",
        title: `Placeholder text is still on your page: ${name}`,
        why: "Visitors will think the site is unfinished or untrustworthy.",
        evidence: snippet(text, match.index, match[0].length),
        fix: "Replace it with your real content.",
      });
    }
    return findings;
  },
};
