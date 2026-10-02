import { isHstsPreloadedTld } from "../data/hsts-preloaded-tlds.js";
import type { Check, Finding } from "../types.js";

interface HeaderRule {
  name: string; // what the evidence lists
  explain: string; // one plain sentence: what it does and what to add
  missing(headers: Record<string, string>): boolean;
}

const RULES: HeaderRule[] = [
  {
    name: "Content-Security-Policy",
    explain:
      "Content-Security-Policy is a browser rule that limits which scripts may run on your page, so an injected script cannot steal your visitors' data: ask your host or developer to add it, listing the sites your scripts come from.",
    missing: (h) => !h["content-security-policy"],
  },
  {
    name: "X-Content-Type-Options",
    explain:
      "X-Content-Type-Options stops browsers from guessing file types, so an uploaded file cannot be run as a script: add the value nosniff.",
    missing: (h) => !h["x-content-type-options"],
  },
  {
    name: "Referrer-Policy",
    explain:
      "Referrer-Policy controls what other websites learn about the page a visitor came from, so private addresses do not leak: add strict-origin-when-cross-origin.",
    missing: (h) => !h["referrer-policy"],
  },
  {
    name: "frame protection (X-Frame-Options)",
    explain:
      "X-Frame-Options stops other websites from showing your page hidden inside theirs to trick visitors into clicking: add X-Frame-Options: DENY, or a frame-ancestors rule in your Content Security Policy.",
    missing: (h) => !h["x-frame-options"] && !/(^|;)\s*frame-ancestors\b/i.test(h["content-security-policy"] ?? ""),
  },
];

const HSTS: HeaderRule = {
  name: "Strict-Transport-Security",
  explain:
    "Strict-Transport-Security tells browsers to always use the secure version of your site, so visitors are not silently pushed onto an unencrypted connection: add max-age=31536000.",
  missing: (h) => !h["strict-transport-security"],
};

export const sec003: Check = {
  id: "SEC-003",
  title: "Browser security headers",
  category: "security",
  mode: "passive",
  async run(ctx) {
    const final = new URL(ctx.finalUrl);
    // Browsers force https on preloaded top-level domains (.dev, .app, ...) themselves, so the header adds nothing there.
    const rules = final.protocol === "https:" && !isHstsPreloadedTld(final.hostname) ? [...RULES, HSTS] : RULES;
    const missing = rules.filter((rule) => rule.missing(ctx.headers));
    if (missing.length === 0) return [];
    // One finding per site: nearly every site lacks some of these, so listing each as its own finding drowned out
    // the problems that matter. It is low because each header is defence in depth, not a hole by itself.
    const finding: Finding = {
      checkId: "SEC-003",
      severity: "low",
      title: "Your site is missing some browser security settings",
      why: "These are extra protections your site can ask visitors' browsers to switch on; without them, other attacks on your visitors are easier.",
      evidence: `Not sent by ${ctx.finalUrl}: ${missing.map((rule) => rule.name).join(", ")}`,
      fix: missing.map((rule) => rule.explain).join(" "),
    };
    return [finding];
  },
};
