// Small regex helpers over the rendered HTML. Good enough for checks that only
// need a title, a meta tag, inline scripts or visible text; not a full parser.

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m);
}

const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();

function headOf(html: string): string {
  return /<head\b[\s\S]*?<\/head>/i.exec(html)?.[0] ?? html;
}

export function getTitle(html: string): string {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(headOf(html));
  return match ? collapse(decodeEntities(match[1])) : "";
}

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

export function getMetaContent(html: string, name: string): string {
  for (const tag of headOf(html).match(/<meta\b[^>]*>/gi) ?? []) {
    if (attr(tag, "name")?.toLowerCase() === name.toLowerCase()) {
      return collapse(decodeEntities(attr(tag, "content") ?? ""));
    }
  }
  return "";
}

// Bodies of inline <script> blocks (those without a src attribute).
export function inlineScripts(html: string): string[] {
  const bodies: string[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (attr(match[1], "src") === undefined && match[2].trim() !== "") bodies.push(match[2]);
  }
  return bodies;
}

// What a visitor reads: scripts, styles, noscript, comments and form labels/options removed.
export function visibleText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|label|option)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  return collapse(decodeEntities(stripped));
}

export interface MetaTag {
  name?: string;
  property?: string;
  content: string;
}

// Every <meta> in the document (name, property and content already trimmed and entity-decoded).
export function metaTags(html: string): MetaTag[] {
  return (html.match(/<meta\b[^>]*>/gi) ?? []).map((tag) => ({
    name: attr(tag, "name")?.trim().toLowerCase(),
    property: attr(tag, "property")?.trim().toLowerCase(),
    content: collapse(decodeEntities(attr(tag, "content") ?? "")),
  }));
}

// href of every <link>, keyed by its lowercase rel tokens.
export function linkRels(html: string): { rels: string[]; href: string }[] {
  return (html.match(/<link\b[^>]*>/gi) ?? []).map((tag) => ({
    rels: (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean),
    href: (attr(tag, "href") ?? "").trim(),
  }));
}

// The markup a browser actually renders as content: no comments, scripts, styles, noscript or templates.
export function withoutHidden(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, " ");
}
