import type { PageContext } from "../context.js";
import { inlineScripts } from "../html.js";
import { redact } from "../redact.js";
import type { Check, Finding, Severity } from "../types.js";

interface Rule {
  provider: string;
  title: string;
  why: string;
  severity: Severity;
  prefix: string;
  pattern: RegExp; // group 1 is the secret
  skip?: (secret: string) => boolean;
}

// Strict prefixes only. Publishable keys (pk_, sb_publishable_, anon JWTs), Firebase config and
// Google AIza keys are public by design and are deliberately absent.
const RULES: Rule[] = [
  {
    provider: "Stripe",
    title: "A secret Stripe payment key is visible in your website's code",
    why: "Anyone can copy it from your site and use it to move money or read your customers' payment data.",
    severity: "critical",
    prefix: "_live_",
    pattern: /(?<![A-Za-z0-9_])((?:sk|rk)_live_[A-Za-z0-9]{20,})/g,
  },
  {
    provider: "Stripe",
    title: "A secret Stripe test key is visible in your website's code",
    why: "Anyone can copy it and tamper with your test payments, and it suggests your live key may be handled the same way.",
    severity: "medium",
    prefix: "_test_",
    pattern: /(?<![A-Za-z0-9_])((?:sk|rk)_test_[A-Za-z0-9]{20,})/g,
  },
  {
    provider: "OpenAI",
    title: "A secret OpenAI key is visible in your website's code",
    why: "Anyone can copy it and run up charges on your OpenAI account.",
    severity: "critical",
    prefix: "sk-proj-",
    pattern: /(?<![A-Za-z0-9_-])(sk-proj-[A-Za-z0-9_-]{20,})/g,
  },
  {
    provider: "OpenAI",
    title: "A secret OpenAI key is visible in your website's code",
    why: "Anyone can copy it and run up charges on your OpenAI account.",
    severity: "critical",
    prefix: "sk-",
    pattern: /(?<![A-Za-z0-9_-])(sk-[A-Za-z0-9]{48})(?![A-Za-z0-9_-])/g,
  },
  {
    provider: "OpenAI",
    title: "An OpenAI admin key is visible in your website's code",
    why: "Anyone can copy it and manage your whole OpenAI organization, including creating more keys.",
    severity: "critical",
    prefix: "sk-admin-",
    pattern: /(?<![A-Za-z0-9_-])(sk-admin-[A-Za-z0-9_-]{20,})/g,
  },
  {
    provider: "Anthropic",
    title: "A secret Anthropic key is visible in your website's code",
    why: "Anyone can copy it and run up charges on your Anthropic account.",
    severity: "critical",
    prefix: "sk-ant-",
    pattern: /(?<![A-Za-z0-9_-])(sk-ant-[A-Za-z0-9_-]{20,})/g,
  },
  {
    provider: "Amazon Web Services",
    title: "An Amazon Web Services access key ID is visible in your website's code",
    why: "It identifies your cloud account to attackers, and if its matching secret leaks too they could use your cloud services.",
    severity: "high",
    prefix: "AKIA",
    pattern: /(?<![A-Za-z0-9])(AKIA[0-9A-Z]{16})(?![A-Za-z0-9])/g,
    skip: (secret) => secret.endsWith("EXAMPLE"), // the key printed in AWS's own documentation
  },
  {
    provider: "GitHub",
    title: "A GitHub access token is visible in your website's code",
    why: "Anyone can copy it and read or change your code repositories.",
    severity: "critical",
    prefix: "ghp_",
    pattern: /(?<![A-Za-z0-9_])(ghp_[A-Za-z0-9]{36})(?![A-Za-z0-9_])/g,
  },
  {
    provider: "GitHub",
    title: "A GitHub access token is visible in your website's code",
    why: "Anyone can copy it and read or change your code repositories.",
    severity: "critical",
    prefix: "github_pat_",
    pattern: /(?<![A-Za-z0-9_])(github_pat_[A-Za-z0-9_]{40,})/g,
  },
  {
    provider: "Supabase",
    title: "A Supabase admin key is visible in your website's code",
    why: "It skips all of your database's access rules, so anyone can read, change, or delete all of your data.",
    severity: "critical",
    prefix: "sb_secret_",
    pattern: /(?<![A-Za-z0-9_])(sb_secret_[A-Za-z0-9_-]{20,})/g,
  },
];

const JWT_PATTERN = /(?<![A-Za-z0-9_-])(eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]+)/g;

const isPlaceholder = (tail: string): boolean => /^(.)\1*$/.test(tail); // xxxxxxxx, 00000000

function serviceRoleJwt(payload: string): boolean {
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof claims === "object" && claims !== null && (claims as { role?: unknown }).role === "service_role";
  } catch {
    return false;
  }
}

// Query strings and fragments can carry tokens, so they never reach the report.
function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return url;
  }
}

const INLINE_LABEL = "the page's HTML (inline script)";

function sources(ctx: PageContext): { label: string; text: string }[] {
  return [
    ...ctx.scripts.map((s) => ({ label: cleanUrl(s.url), text: s.body })),
    ...[...inlineScripts(ctx.rawHtml), ...inlineScripts(ctx.html)].map((text) => ({ label: INLINE_LABEL, text })),
  ];
}

interface Hit {
  secret: string;
  title: string;
  why: string;
  severity: Severity;
  provider: string;
  places: string[];
}

export const sec001: Check = {
  id: "SEC-001",
  title: "Secret keys in your website's code",
  category: "security",
  mode: "passive",
  async run(ctx) {
    const hits = new Map<string, Hit>();
    const record = (hit: Omit<Hit, "places">, label: string): void => {
      const existing = hits.get(hit.secret);
      if (!existing) hits.set(hit.secret, { ...hit, places: [label] });
      else if (!existing.places.includes(label)) existing.places.push(label);
    };

    for (const { label, text } of sources(ctx)) {
      for (const rule of RULES) {
        for (const match of text.matchAll(rule.pattern)) {
          const secret = match[1];
          const tail = secret.slice(secret.indexOf(rule.prefix) + rule.prefix.length);
          if (rule.skip?.(secret) || isPlaceholder(tail)) continue;
          record({ secret, title: rule.title, why: rule.why, severity: rule.severity, provider: rule.provider }, label);
        }
      }
      for (const match of text.matchAll(JWT_PATTERN)) {
        if (!serviceRoleJwt(match[2])) continue;
        record(
          {
            secret: match[1],
            title: "A Supabase admin key is visible in your website's code",
            why: "It skips all of your database's access rules, so anyone can read, change, or delete all of your data.",
            severity: "critical",
            provider: "Supabase",
          },
          label,
        );
      }
    }

    return [...hits.values()].map((hit): Finding => {
      const extra = hit.places.length > 1 ? ` and ${hit.places.length - 1} other place(s)` : "";
      return {
        checkId: "SEC-001",
        severity: hit.severity,
        title: hit.title,
        why: hit.why,
        evidence: `${redact(hit.secret)} (in ${hit.places[0]}${extra})`,
        fix: `Remove the key from your website's code, create a new one in your ${hit.provider} dashboard, and delete the exposed one.`,
      };
    });
  },
};

// Hides anything key-shaped in free text (for example a console error that quotes a key): known key
// formats and long random-looking tokens are redacted, and query strings in addresses are dropped.
export function scrubSecrets(text: string): string {
  let out = text.replace(/(https?:\/\/[^\s"'<>)?#]+)\?[^\s"'<>)]*/g, "$1?…");
  for (const rule of RULES) out = out.replace(rule.pattern, (_match, secret: string) => redact(secret));
  out = out.replace(JWT_PATTERN, (_match, token: string) => redact(token));
  // 32 or more letters, digits, dashes or underscores with at least one letter and one digit
  return out.replace(/(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}/g, (token) => redact(token));
}
