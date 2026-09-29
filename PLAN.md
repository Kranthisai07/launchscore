# launchscore: PLAN

One milestone per Claude Code session. Commit after each. Check boxes as you go. If the plan changes, edit this file, do not write a new master prompt.

## Week 1: core engine + share card
- [ ] M1 Scaffold: TypeScript CLI, `launchscore <url>` prints "ok". Vitest running. CI on push.
- [ ] M2 Fixture sites: `fixtures/good` (must produce zero findings) and `fixtures/bad` (one planted issue per check). Local server for tests.
- [ ] M3 Check registry + runner: check interface, page context (HTML, headers, loaded JS bundles via Playwright), JSON report writer.
- [ ] M4 First 5 checks: SEC-001, SEC-003, SEC-004, SEO-001, HYG-003. Tests against both fixtures.
- [ ] M5 Scoring + share card PNG (HTML template screenshotted by Playwright).

Done when: `npx launchscore http://localhost:xxxx` on the bad fixture outputs a red card and JSON with 5 findings; good fixture outputs zero.

## Week 2: remaining passive checks + HTML report
- [ ] M6 SEC-002, SEC-005, SEO-002 to SEO-005.
- [ ] M7 A11Y-001 (axe-core) and PERF-001 (Lighthouse).
- [ ] M8 HYG-001, HYG-002, HYG-004, HYG-005, HYG-006.
- [ ] M9 HTML report in plain English: what's wrong, why it matters, how to fix, grouped by severity.
- [ ] M10 Run against 10 real public sites you own or have permission for. Log every false positive and fix it.

## Week 3: active checks + fix plugin
- [ ] M11 `launchscore verify <domain>`: token issue, well-known file and DNS TXT verification.
- [ ] M12 SEC-006 Supabase RLS read test and SEC-007, gated behind verification. Redaction tests.
- [ ] M13 Claude Code plugin: `/launchscore` command runs the scan, skill reads the JSON, fixes one finding at a time with a playbook per check ID, then prompts re-scan.
- [ ] M14 Fix playbooks for every check ID (short Markdown, one file per ID).

## Week 4: launch prep
- [ ] M15 README: GIF (red card, fix, green card) above the fold, one-line installs, what it catches, methodology, safety policy.
- [ ] M16 Publish to npm, tag v0.1.0, submit plugin to the Claude directory.
- [ ] M17 Scan follower apps with permission; collect aggregate stats only.
- [ ] M18 Launch assets: X thread, Show HN post, Reddit posts, Reel/Short script.
- [ ] Stretch: passive-lite web page (no browser, fetch-only checks) on Vercel.
