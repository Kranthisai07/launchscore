import type { Check, Finding, Severity } from "../types.js";

interface HeaderRule {
  title: string;
  why: string;
  severity: Severity;
  fix: string;
  missing(headers: Record<string, string>): boolean;
}

const RULES: HeaderRule[] = [
  {
    title: "Your site has no Content Security Policy (a browser rule that limits which scripts may run on your page)",
    why: "Without it, a single injected script can steal your visitors' data or take over the page.",
    severity: "medium",
    fix: "Ask your host or developer to add a Content-Security-Policy header listing the sites your page is allowed to load scripts from.",
    missing: (h) => !h["content-security-policy"],
  },
  {
    title: "Your site does not stop browsers from guessing file types (X-Content-Type-Options header missing)",
    why: "A browser may treat an uploaded file as a script and run it.",
    severity: "low",
    fix: "Add the header X-Content-Type-Options: nosniff.",
    missing: (h) => !h["x-content-type-options"],
  },
  {
    title: "Your site does not control what it tells other sites about where visitors came from (Referrer-Policy header missing)",
    why: "Private page addresses can leak to other websites when visitors click a link.",
    severity: "low",
    fix: "Add the header Referrer-Policy: strict-origin-when-cross-origin.",
    missing: (h) => !h["referrer-policy"],
  },
  {
    title: "Your site can be embedded inside other websites (frame protection missing)",
    why: "Attackers can hide your page inside theirs and trick visitors into clicking buttons they cannot see.",
    severity: "low",
    fix: "Add the header X-Frame-Options: DENY, or a frame-ancestors rule in your Content Security Policy.",
    missing: (h) => !h["x-frame-options"] && !/(^|;)\s*frame-ancestors\b/i.test(h["content-security-policy"] ?? ""),
  },
];

const HSTS: HeaderRule = {
  title: "Your site does not tell browsers to always use the secure version (Strict-Transport-Security header missing)",
  why: "Visitors can be silently pushed onto an unencrypted connection where others can read or change what they see.",
  severity: "low",
  fix: "Add the header Strict-Transport-Security: max-age=31536000.",
  missing: (h) => !h["strict-transport-security"],
};

export const sec003: Check = {
  id: "SEC-003",
  title: "Browser security headers",
  category: "security",
  mode: "passive",
  async run(ctx) {
    const rules = new URL(ctx.finalUrl).protocol === "https:" ? [...RULES, HSTS] : RULES;
    return rules
      .filter((rule) => rule.missing(ctx.headers))
      .map(
        (rule): Finding => ({
          checkId: "SEC-003",
          severity: rule.severity,
          title: rule.title,
          why: rule.why,
          evidence: `Not sent by ${ctx.finalUrl}`,
          fix: rule.fix,
        }),
      );
  },
};
