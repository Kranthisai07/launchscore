# launchscore: PLAN

One milestone per Claude Code session. Commit after each. Check boxes as you go. If the plan changes, edit this file, do not write a new master prompt.

## Week 1: core engine + share card
- [x] M1 Scaffold: TypeScript CLI, `launchscore <url>` prints "ok". Vitest running. CI on push.
- [x] M2 Fixture sites: `fixtures/good` (must produce zero findings) and `fixtures/bad` (one planted issue per passive check, see `fixtures/bad/MANIFEST.md`). Local server for tests. SEC-004 is not in the fixtures (localhost has no TLS), so it gets unit tests in M4. SEC-006 and SEC-007 are deferred to M12.
- [x] M3 Check registry + runner: check interface, page context (HTML, headers, loaded JS bundles via Playwright), JSON report writer.
- [x] M4 First 5 checks: SEC-001, SEC-003, SEC-004, SEO-001, HYG-003. Tests against both fixtures. SEC-004 is tested with unit tests (no TLS on localhost).
- [x] M5 Scoring + share card PNG (HTML template screenshotted by Playwright).

Done when: `npx launchscore http://localhost:xxxx` on the bad fixture outputs a red card (about 12/100, BLOCKED: CRITICAL ISSUE) and JSON with 28 findings (SEC-001 x2, SEC-002 x1, SEC-003 x4, SEO-001 x2, SEO-002 x2, SEO-003 x2, SEO-004 x1, SEO-005 x2, A11Y-001 x3, HYG-001 x1, HYG-002 x1, HYG-003 x4, HYG-004 x1, HYG-005 x1, HYG-006 x1; SEC-004 cannot trigger on localhost) plus up to 3 low speed tips from PERF-001, and 1 detection (Supabase). The performance score comes from Lighthouse and varies a little from run to run (57 here), so the bad total is "about" 12. The good fixture outputs zero findings and the same Supabase detection, all five categories tested, 100 and READY TO LAUNCH (card tag DATABASE NOT TESTED). With `--no-perf` performance is untested: bad = 4, good = 100 ALMOST READY.

## Week 2: remaining passive checks + HTML report
- [x] M6 SEC-002, SEC-005, SEO-002 to SEO-005.
- [x] M7 A11Y-001 (axe-core) and PERF-001 (Lighthouse 13, so Node 22.19+).
- [x] M8 HYG-001, HYG-002, HYG-004, HYG-005, HYG-006.
- [x] M9 HTML report in plain English: what's wrong, why it matters, how to fix, grouped by severity. One self-contained `launchscore-report.html` (no JavaScript, no external requests), plus `--open`.
- [ ] M10 Run against 10 real public sites you own or have permission for. Log every false positive and fix it.

## Week 3: active checks + fix plugin
- [ ] M11 `launchscore verify <domain>`: token issue, well-known file and DNS TXT verification.
- [ ] M12 SEC-006 Supabase RLS read test and SEC-007, gated behind verification. Redaction tests. Deferred from M2: add the mock Supabase API, `/.env` and `/.git/config` to `fixtures/bad` (with markers in `fixtures/markers.ts` and rows in `fixtures/bad/MANIFEST.md`), and keep them absent from `fixtures/good`.
- [ ] M13 Claude Code plugin: `/launchscore` command runs the scan, skill reads the JSON, fixes one finding at a time with a playbook per check ID, then prompts re-scan.
- [ ] M14 Fix playbooks for every check ID (short Markdown, one file per ID).

## Week 4: launch prep
- [ ] M15 README: GIF (red card, fix, green card) above the fold, one-line installs, what it catches, methodology, safety policy.
- [ ] M16 Publish to npm, tag v0.1.0, submit plugin to the Claude directory.
- [ ] M17 Scan follower apps with permission; collect aggregate stats only.
- [ ] M18 Launch assets: X thread, Show HN post, Reddit posts, Reel/Short script.
- [ ] Stretch: passive-lite web page (no browser, fetch-only checks) on Vercel.
