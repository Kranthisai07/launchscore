import { isPlaceholderHostname } from "../data/placeholder-hosts.js";
import { decodeEntities, getTitle, metaTags, visibleText, withoutHidden } from "../html.js";
import type { Check, Finding } from "../types.js";

interface Pattern {
  name: string;
  regex: RegExp; // global; the whole match is the placeholder in its context
}

// Words that mark a copyright line ("© 2025 Your Company"), as they appear after entity decoding.
const COPYRIGHT = String.raw`(?:©|&copy;|\(c\)|Copyright)\s*(?:\d{4}(?:\s*[-–]\s*\d{4})?\s*)?`;

// Placeholder phrases are matched in Title Case only, and "Your Company" / "Company Name" only in a placeholder
// context: "grow your company faster", "Grow Your Company Faster" and a "Company Name" form field are real text.
// "Coming soon" is deliberately not here: it is often intentional.
const PATTERNS: Pattern[] = [
  { name: "Lorem ipsum", regex: /lorem ipsum/gi },
  { name: "Your Company", regex: /\bYour Company\s+(?:Name|Inc\.?|LLC|Ltd\.?|Logo)\b/g },
  { name: "Your Company", regex: new RegExp(`${COPYRIGHT}Your Company\\b`, "g") },
  { name: "Company Name", regex: new RegExp(`${COPYRIGHT}Company Name\\b`, "g") },
  { name: "John Doe", regex: /\bJohn Doe\b/g },
  { name: "Jane Doe", regex: /\bJane Doe\b/g },
  { name: "an example.com or test.com email address", regex: /[\w.+-]+@(?:example|test)\.com\b/gi },
];

const SNIPPET_RADIUS = 40;

// Evidence is a short piece of visible page text, not a secret, so it is not passed through redact().
function snippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + length + SNIPPET_RADIUS);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

interface Hit {
  name: string;
  start: number;
  end: number;
}

// Every match of every pattern, minus any that overlaps one already kept (the earliest wins), so
// "© 2025 Your Company Name" is one hit, not two.
function hitsIn(text: string): Hit[] {
  const all: Hit[] = PATTERNS.flatMap(({ name, regex }) =>
    [...text.matchAll(regex)].map((m) => ({ name, start: m.index, end: m.index + m[0].length })),
  );
  all.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Hit[] = [];
  for (const hit of all) if (kept.every((k) => hit.start >= k.end || hit.end <= k.start)) kept.push(hit);
  return kept;
}

// "Your Company" that is the whole text of an element (<h2>Your Company</h2>, <title>Your Company</title>).
// Form labels and options are left out: they ask the visitor for their own company.
function wholeElementPlaceholder(html: string): boolean {
  const markup = withoutHidden(html).replace(/<(label|option)\b[\s\S]*?<\/\1\s*>/gi, " ");
  return [...markup.matchAll(/>([^<>]*)</g)].some((m) => decodeEntities(m[1]).trim() === "Your Company");
}

const META_PHRASES = ["Your Website Title", "Your Name or Company Name"];
const META_TEXT_TAGS = new Set(["description", "author", "og:title", "og:description", "og:site_name", "twitter:title", "twitter:description"]);
const META_URL_TAGS = new Set(["og:url", "og:image", "twitter:url", "twitter:image"]);
const MAX_META_EVIDENCE = 5;

const isPlaceholderHost = (value: string): boolean => {
  try {
    return isPlaceholderHostname(new URL(value).hostname);
  } catch {
    return false;
  }
};

// Placeholder values in the page title and the tags that make up search results and link previews.
// The canonical link is SEO-005's: one bad address should not be reported twice.
function metaPlaceholders(htmls: string[]): string[] {
  const found = new Map<string, string>();
  for (const html of htmls) {
    const entries: [string, string][] = [["title", getTitle(html)]];
    for (const tag of metaTags(html)) {
      const key = tag.property || tag.name;
      if (key) entries.push([key, tag.content]);
    }
    for (const [key, value] of entries) {
      const bad =
        (key === "title" || META_TEXT_TAGS.has(key)) && META_PHRASES.some((p) => value.includes(p))
          ? true
          : META_URL_TAGS.has(key) && isPlaceholderHost(value);
      if (bad) found.set(`${key}\u0000${value}`, `${key} = "${value.length > 60 ? `${value.slice(0, 60)}…` : value}"`);
    }
  }
  return [...found.values()];
}

export const hyg003: Check = {
  id: "HYG-003",
  title: "Placeholder content",
  category: "hygiene",
  mode: "passive",
  async run(ctx) {
    const text = visibleText(ctx.html);
    const findings: Finding[] = [];
    const seen = new Set<string>();
    for (const hit of hitsIn(text)) {
      if (seen.has(hit.name)) continue;
      seen.add(hit.name);
      findings.push({
        checkId: "HYG-003",
        severity: "medium",
        title: `Placeholder text is still on your page: ${hit.name}`,
        why: "Visitors will think the site is unfinished or untrustworthy.",
        evidence: snippet(text, hit.start, hit.end - hit.start),
        fix: "Replace it with your real content.",
      });
    }

    if (!seen.has("Your Company") && wholeElementPlaceholder(ctx.html)) {
      findings.push({
        checkId: "HYG-003",
        severity: "medium",
        title: "Placeholder text is still on your page: Your Company",
        why: "Visitors will think the site is unfinished or untrustworthy.",
        evidence: '"Your Company" is the entire text of an element on the page',
        fix: "Replace it with your real content.",
      });
    }

    const meta = metaPlaceholders([ctx.rawHtml, ctx.html]);
    if (meta.length > 0) {
      findings.push({
        checkId: "HYG-003",
        severity: "medium",
        title: "Placeholder text is still in your page's title or link-preview tags",
        why: "Search results and shared links will show the placeholder, so the site looks unfinished.",
        evidence: meta.slice(0, MAX_META_EVIDENCE).join("; ") + (meta.length > MAX_META_EVIDENCE ? `; and ${meta.length - MAX_META_EVIDENCE} more` : ""),
        fix: "Replace them with your real title, description, name and web address.",
      });
    }
    return findings;
  },
};
