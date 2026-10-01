import type { PageContext } from "./context.js";

export type Severity = "critical" | "high" | "medium" | "low";
export type Category = "security" | "seo" | "accessibility" | "performance" | "hygiene";

export interface Finding {
  checkId: string;
  severity: Severity;
  title: string; // plain English, no jargon
  why: string; // one sentence, what could happen
  evidence: string; // redacted
  fix: string; // one sentence for humans; plugin uses playbooks
}

// A fact about the site's stack that is not a problem. Reported, never scored.
export interface Detection {
  checkId: string;
  stack: string;
  url?: string;
  note: string;
}

export interface Check {
  id: string; // "SEC-001"
  title: string;
  category: Category;
  mode: "passive" | "active";
  run(ctx: PageContext): Promise<Finding[]>;
  detect?(ctx: PageContext): Promise<Detection[]>;
}

export interface NotTested {
  checkId: string;
  title: string;
  reason: string;
}
