// What axe found, trimmed to what the A11Y check reads (no HTML snippets are kept).
export interface AxeViolation {
  id: string;
  impact: string | null; // critical, serious, moderate, minor
  help: string;
  helpUrl: string;
  nodes: number; // elements affected
  firstTarget: string; // CSS selector of the first affected element
}

export type AxeOutcome = { violations: AxeViolation[] } | { error: string };

// WCAG 2.0 and 2.1, levels A and AA. Best-practice rules are not accessibility failures, and the
// 2.2 target-size rule flags ordinary adjacent links, so neither is included.
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const targetText = (target: unknown): string =>
  Array.isArray(target) ? target.map((part) => targetText(part)).join(" ") : String(target ?? "");

interface RawViolation {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  nodes: { target?: unknown }[];
}

// Only `violations` is read: axe's "incomplete" (needs review) results are never kept.
export function summarizeAxe(results: { violations: RawViolation[] }): AxeOutcome {
  return {
    violations: results.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.length,
      firstTarget: targetText(v.nodes[0]?.target),
    })),
  };
}
