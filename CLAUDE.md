# CLAUDE.md

Read SPEC.md and PLAN.md before any work. Work only on the next unchecked milestone in PLAN.md unless told otherwise. Use plan mode first, then implement, then run tests, then check the box and commit.

## Stack
- Node 20+, TypeScript (strict), pnpm
- CLI: commander. Build: tsup. Tests: vitest
- Browser: playwright (chromium). A11y: @axe-core/playwright. Perf: lighthouse
- Validation: zod for the report schema

## Structure
```
src/
  cli.ts              entry, arg parsing
  scan.ts             runs the runner and writes the JSON report (used by cli.ts)
  types.ts            Check, Finding, Detection, NotTested
  runner.ts           loads page context, runs checks, applies scoring
  context.ts          PageContext: url, html, headers, scripts (url + body), consoleErrors, links
  checks/             one file per check, filename = check id (sec-001.ts)
  checks/index.ts     registry array
  score.ts
  report/json.ts  report/html.ts  report/card.ts
  verify.ts           domain verification
  redact.ts
plugin/               Claude Code plugin (command, skill, fix playbooks)
fixtures/good/  fixtures/bad/
tests/
```

## Check interface
```ts
type Severity = "critical" | "high" | "medium" | "low";
type Category = "security" | "seo" | "accessibility" | "performance" | "hygiene";

interface Check {
  id: string;              // "SEC-001"
  title: string;
  category: Category;
  mode: "passive" | "active";
  run(ctx: PageContext): Promise<Finding[]>;
  detect?(ctx: PageContext): Promise<Detection[]>;  // stack facts (SEC-005), reported but never scored
}

interface Finding {
  checkId: string;
  severity: Severity;
  title: string;           // plain English, no jargon
  why: string;             // one sentence, what could happen
  evidence: string;        // redacted
  fix: string;             // one sentence for humans; plugin uses playbooks
}
```

## Rules
- Every new check ships with a planted issue in `fixtures/bad` and a test proving `fixtures/good` stays clean. No check merges without both.
- False positives are worse than misses. When unsure, downgrade severity or do not report.
- Never print, log, or write a full secret. Always pass evidence through `redact()`.
- Active checks must call `assertVerified(url)` first. `localhost` and `127.0.0.1` count as verified.
- Never store response bodies from database probes. Table name and readable yes/no only.
- Max 5 concurrent requests to the target.
- User-facing text is plain English for non-coders. No "RLS", "CSP" without a one-line explanation.
- For the Claude Code plugin manifest and folder layout, follow the current official Claude Code plugin docs. Do not guess the schema.
- Keep dependencies minimal. Ask before adding one not listed above.
- Never rewrite git history, amend pushed commits, or force-push without asking first.

## Commands
- `pnpm dev <url>` run locally
- `pnpm test`
- `pnpm build`
