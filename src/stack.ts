import type { PageContext } from "./context.js";
import { inlineScripts } from "./html.js";

// Words that look like a project name but are Supabase's own sites.
const NOT_A_PROJECT = new Set(["www", "api", "app", "docs", "status", "supabase"]);
const SUPABASE_HOST = /https?:\/\/([a-z0-9][a-z0-9-]{1,62})\.supabase\.co\b/gi;

function sources(ctx: PageContext): string[] {
  return [...ctx.scripts.map((s) => s.body), ctx.rawHtml, ctx.html, ...inlineScripts(ctx.html)];
}

// Project hosts such as "abcdefghij.supabase.co", unique and lowercased.
export function findSupabaseHosts(ctx: PageContext): string[] {
  const hosts = new Set<string>();
  for (const text of sources(ctx)) {
    for (const match of text.matchAll(SUPABASE_HOST)) {
      if (!NOT_A_PROJECT.has(match[1].toLowerCase())) hosts.add(`${match[1].toLowerCase()}.supabase.co`);
    }
  }
  return [...hosts];
}

// Sign-in services whose addresses show up in a page's code. Used to tell that a site has accounts.
const AUTH_PROVIDERS: { name: string; pattern: RegExp }[] = [
  { name: "Firebase sign-in", pattern: /identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/i },
  { name: "Auth0", pattern: /\b[a-z0-9-]+\.auth0\.com\b/i },
  { name: "Clerk", pattern: /\bclerk\.accounts\.dev\b|\bclerk\.com\b|\bclerk\.dev\b/i },
  { name: "Amazon Cognito", pattern: /cognito-idp\.[a-z0-9-]+\.amazonaws\.com/i },
  { name: "Okta", pattern: /\b[a-z0-9-]+\.okta\.com\b/i },
];

// Names of sign-in providers found (Supabase included), for example ["Supabase", "Auth0"].
export function findAuthProviders(ctx: PageContext): string[] {
  const found: string[] = [];
  if (findSupabaseHosts(ctx).length > 0) found.push("Supabase");
  const text = sources(ctx).join("\n");
  for (const provider of AUTH_PROVIDERS) if (provider.pattern.test(text)) found.push(provider.name);
  return found;
}
