import { inlineScripts } from "../html.js";
import type { Check, Detection } from "../types.js";

// Not a problem, so it is a detection: it is reported but never scored.
// Words that look like a project name but are Supabase's own sites.
const NOT_A_PROJECT = new Set(["www", "api", "app", "docs", "status", "supabase"]);
const SUPABASE_HOST = /https?:\/\/([a-z0-9][a-z0-9-]{1,62})\.supabase\.co\b/gi;

export const sec005: Check = {
  id: "SEC-005",
  title: "Supabase detected",
  category: "security",
  mode: "passive",
  async run() {
    return [];
  },
  async detect(ctx) {
    const sources = [...ctx.scripts.map((s) => s.body), ctx.rawHtml, ctx.html, ...inlineScripts(ctx.html)];
    const hosts = new Set<string>();
    for (const text of sources) {
      for (const match of text.matchAll(SUPABASE_HOST)) {
        if (!NOT_A_PROJECT.has(match[1].toLowerCase())) hosts.add(`${match[1].toLowerCase()}.supabase.co`);
      }
    }
    return [...hosts].map(
      (host): Detection => ({
        checkId: "SEC-005",
        stack: "supabase",
        url: host,
        note: "This site uses Supabase as its database. A test of who can read your data becomes available once you verify your domain.",
      }),
    );
  },
};
