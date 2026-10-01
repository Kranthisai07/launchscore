import type { AxeViolation } from "../axe.js";
import type { Check, Finding, Severity } from "../types.js";

// Covered by another check (SEO-001 reports a missing title), so it is not counted twice.
const SKIPPED_RULES = new Set(["document-title"]);

const SEVERITY: Record<string, Severity> = { critical: "high", serious: "medium", moderate: "low", minor: "low" };

// Rules whose severity is fixed whatever axe says. Small touch targets are worth fixing, but are far
// less likely to stop someone using the page than a missing label or unreadable text.
const SEVERITY_OVERRIDE: Record<string, Severity> = { "target-size": "low" };

interface Plain {
  title: string;
  why: string;
  fix: string;
}

const KNOWN: Record<string, Plain> = {
  "image-alt": {
    title: "Some images have no text description (alt text)",
    why: "People who use screen readers cannot tell what these images show, and search engines cannot read them either.",
    fix: 'Add a short alt description to each image (use alt="" for purely decorative ones).',
  },
  "color-contrast": {
    title: "Some text is too faint to read easily (low color contrast)",
    why: "People with low vision, or anyone looking at a screen in bright light, may not be able to read it.",
    fix: "Make the text darker or the background lighter until the contrast is at least 4.5 to 1 (3 to 1 for large text).",
  },
  label: {
    title: "Some form fields have no label",
    why: "Screen reader users cannot tell what to type in the field, and nothing larger than the box itself can be tapped to select it.",
    fix: "Give every field a visible label that is connected to it (a label element with a matching for attribute).",
  },
  "link-name": {
    title: "Some links have no readable text",
    why: "Screen reader users hear only the word link and cannot tell where it goes.",
    fix: "Give each link readable text, or a hidden text label (aria-label) when it is only an icon.",
  },
  "button-name": {
    title: "Some buttons have no readable name",
    why: "Screen reader users hear only the word button and cannot tell what it does.",
    fix: "Give each button visible text, or a hidden text label (aria-label) when it is only an icon.",
  },
  "target-size": {
    title: "Some buttons or links are too small or too close together to tap easily",
    why: "People with shaky hands, large fingers or a small screen may tap the wrong thing.",
    fix: "Make each tappable item at least 24 by 24 pixels, or leave enough space around it.",
  },
  "html-has-lang": {
    title: "Your page does not say what language it is written in",
    why: "Screen readers may pronounce your text wrongly, and browsers cannot offer to translate it.",
    fix: 'Add lang="en" (or your language code) to the opening html tag.',
  },
};

const plural = (n: number): string => `${n} element${n === 1 ? "" : "s"}`;

function toFinding(v: AxeViolation): Finding {
  const known = KNOWN[v.id];
  return {
    checkId: "A11Y-001",
    severity: SEVERITY_OVERRIDE[v.id] ?? SEVERITY[v.impact ?? ""] ?? "low",
    title: known?.title ?? `Accessibility issue: ${v.help}`,
    why:
      known?.why ??
      "People who use screen readers, keyboards or have low vision may not be able to use this part of your page.",
    evidence: `${plural(v.nodes)}, first: ${v.firstTarget}`,
    fix: known?.fix ?? `Follow the steps at ${v.helpUrl} to fix it.`,
  };
}

export const a11y001: Check = {
  id: "A11Y-001",
  title: "Accessibility",
  category: "accessibility",
  mode: "passive",
  async run(ctx) {
    // axe ran during the page load. If it failed, say so: an empty list would read as "no problems".
    if ("error" in ctx.axe) throw new Error(`the accessibility scan failed: ${ctx.axe.error}`);
    // One finding per rule. axe's needs-review ("incomplete") results are not stored, so they cannot leak in.
    return ctx.axe.violations.filter((v) => !SKIPPED_RULES.has(v.id) && v.nodes > 0).map(toFinding);
  },
};
