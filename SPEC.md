# launchscore: SPEC

## One line
Paste your URL. Find out if your vibe-coded app will get you hacked, sued, or ignored by Google. Then let Claude fix it.

## Problem
Non-engineers ship apps built with Lovable, Bolt, v0, Replit and Claude Code. Those apps often leak secret keys in JS bundles, expose Supabase tables to anyone with the anon key, lack basic SEO, fail accessibility, and ship with placeholder content and no privacy policy. Existing tools either read source code (the user can't evaluate the output) or cover only one area (security OR SEO). Nobody gives a non-coder one score for "is this safe and ready to launch."

## Users
1. Primary: non-engineer vibe coders with a deployed app URL.
2. Secondary: developers using Claude Code who want a pre-launch gate.

## What it does (v1)
1. `npx launchscore <url>` scans a live site.
2. Produces three outputs:
   - `launchscore-report.json` (machine readable, consumed by the fix plugin)
   - `launchscore-report.html` (plain English, grouped by severity)
   - `launchscore-card.png` (shareable 0 to 100 score card)
3. A Claude Code plugin reads the JSON report and fixes findings in the user's repo, one finding at a time, then asks the user to redeploy and re-scan.

## Check modes
- **Passive:** only loads the public page and the assets it references, the same as a normal visitor. Allowed on any URL.
- **Active:** requests anything the page does not reference (probing paths like `/.env`, querying a database API). Allowed only on `localhost` or a domain the user has verified (see Safety).

## v1 checks
Security
- SEC-001 Secret keys in JS bundles (passive). Detect Stripe `sk_live_`/`rk_live_`, OpenAI, Anthropic, AWS access keys, GitHub tokens, Supabase `service_role` JWTs. Decode Supabase JWTs and flag only when the `role` claim is `service_role`. Never flag publishable keys (`pk_`, Supabase anon).
- SEC-002 Public source maps (passive). Only map URLs the page itself references (a sourceMappingURL comment or a SourceMap header on a script) are fetched, never guessed. One finding per site, when a map ships the original source (sourcesContent).
- SEC-003 Missing security headers: CSP, HSTS, frame protection, X-Content-Type-Options, Referrer-Policy (passive).
- SEC-004 HTTPS and HTTP to HTTPS redirect (passive).
- SEC-005 Supabase detected (passive). Not a finding and never scored. Produces an entry in the report's `detected` array (`stack: "supabase"`, project URL, and a note that an RLS test is available after verification).
- SEC-006 Supabase RLS read test (active). Read the PostgREST schema with the anon key, attempt `select` with `limit=1` per table, report which tables are readable. Record table name and row-returned yes/no only. Never store or print row data.
- SEC-007 Exposed `/.env`, `/.git/config` (active).

SEO
- SEO-001 Title and meta description present and sane length.
- SEO-002 Open Graph and Twitter card tags.
- SEO-003 `robots.txt` and `sitemap.xml` present.
- SEO-004 Accidental `noindex`.
- SEO-005 Exactly one `h1`, canonical link.

Accessibility
- A11Y-001 axe-core violations, run during the page load. WCAG 2.0, 2.1 and 2.2 level A and AA rules only (best-practice rules and `document-title` are left out; SEO-001 reports a missing title). One finding per rule id: axe critical is high, serious is medium, moderate and minor are low, except `target-size` (touch targets under 24px), which is always low. Needs-review results are ignored. If axe fails, the category is not tested.

Performance
- PERF-001 Lighthouse (mobile preset, performance only, Lighthouse 13 and Node 22.19+). The performance category score IS Lighthouse score (0 to 100), not deductions. Up to 3 tips, low severity, informational, never deducted. **Decision:** a tip needs an estimated saving of at least 300 ms (the largest of FCP, LCP, TBT or INP) and a Lighthouse score under 0.9. Smaller savings are noise: on the good fixture a 150 ms render-blocking stylesheet would otherwise put a tip on an otherwise perfect card. Runs last and alone. Failure or a 60 s timeout leaves the category not tested. `--no-perf` skips it (also not tested).

Launch hygiene
- HYG-001 Privacy policy link present (link text or path: privacy, datenschutz, confidentialité, privacidad). Missing is medium, and high when the page collects data: a password field, an email field in a form, or a sign-in provider detected (Supabase, Firebase sign-in, Auth0, Clerk, Cognito, Okta).
- HYG-002 Terms link present (terms, terms of service, terms and conditions, /terms, /tos, plus agb, nutzungsbedingungen, conditions générales, términos). Missing is low.
- HYG-003 Placeholder content: lorem ipsum, "Your Company", "John Doe", example.com emails, fake testimonial patterns.
- HYG-004 Favicon: none (no icon link and /favicon.ico is 404 or a soft 404), an icon link to a missing file, or the unchanged starter icon of a framework, matched by SHA-256 against hashes taken from the framework's own template repository (`src/data/default-favicons.ts`: Vite, Next.js, Create React App, Astro, Nuxt, Angular). Never guessed; a framework is only listed once its file is verified. Low.
- HYG-005 Console errors on load. Favicon requests and browser-extension noise are ignored. One finding with the count and the first message (key-shaped text is redacted, query strings dropped): medium when an error comes from the site itself (same host or a subdomain), low when only other sites' scripts, or the source is unknown, fail.
- HYG-006 Broken internal links (cap at 50 links). HEAD, then GET to confirm; only 404 and 410 count as broken. One medium finding (count and first three paths, no query strings). A site that answers every address with a normal page (soft 404) cannot be checked: one request to an address that cannot exist detects this, and the report says "not tested" rather than clean.

## Scoring
- Category weights: Security 40, SEO 15, Accessibility 15, Performance 15, Hygiene 15.
- A category that is measured directly (performance, from Lighthouse) uses that score as is and its findings never deduct. Every other tested category starts at 100. Deductions per finding: critical 60, high 30, medium 15, low 5. Floored at 0.
- A category is tested when at least one of its checks completed. Untested categories show "not tested" (score null), never 100.
- Total = weighted average over tested categories only, renormalized by the tested weight, rounded to a whole number. If no category was tested, there is no score and the verdict is "NOT SCORED".
- Verdicts:
  - Any critical finding: total capped at 49, verdict "BLOCKED: CRITICAL ISSUE".
  - Otherwise 90 or more "READY TO LAUNCH", 70 to 89 "ALMOST READY", below 70 "NEEDS WORK".
- A scan is **partial** when any category is untested, any script was skipped, or any check crashed. A partial scan can never be "READY TO LAUNCH": the verdict is capped at "ALMOST READY".
- Active checks not run because the domain is unverified show as "not tested," never as passed. They do **not** make the scan partial or cap the verdict. Instead the card shows a "DATABASE NOT TESTED" tag when Supabase was detected and no active check ran, and a "VERIFIED" badge when active checks ran.

## Report concept
`launchscore-report.json` holds:
- `findings`: the issues found. Only findings are scored.
- `detected`: facts about the site stack that are not problems, such as `{ checkId: "SEC-005", stack: "supabase", url, note }`. Excluded from scoring, and a clean site may still have entries here.
- `notTested`: checks that were not run (unverified domain), crashed, or could not scan every script.
- `score` (0 to 100, or null when nothing was tested), `verdict`, `categories` (five entries of `{ name, score | null, tested }`), `partial`, and `verified` (active checks ran).

## JavaScript scanning limits
SEC-001 and SEC-005 search the JavaScript the page loads. Scripts are read until the first of these limits:
- 5 MB per file (a bigger file is skipped, never cut short),
- 25 MB of script in total (once the budget is spent, the remaining files are not read),
- 500 files.

A script address that redirects (a 3xx response) is not read and not counted as skipped: the file it points to arrives as its own response and is scanned. Anything skipped makes the scan partial (verdict capped at "ALMOST READY") and is listed under "not tested" with a count per reason, for example "scripts not scanned: 59 over the file limit, 1 unreadable". The report's web page gives each reason its own plain sentence.

## Share card
Two PNGs next to the report: `launchscore-card.png` (1200x630) and `launchscore-card-square.png` (1080x1350). They show the score, verdict, hostname only (never a path or query), per-category bars, and the titles of the top three findings. They never show evidence or secrets.

## Safety (non-negotiable)
- Active checks require verification: the user runs `launchscore verify <domain>`, which issues a token, and the user either serves it at `/.well-known/launchscore.txt` or adds a DNS TXT record `launchscore-verify=<token>`.
- Secrets are always redacted in every output: first 4 and last 4 characters only.
- No telemetry in v1. Nothing leaves the user's machine.
- Rate limit all requests to the target (max 5 concurrent, polite delays).

## Non-goals (v1)
- Source code scanning (Anthropic's `/security-review` covers that).
- Firebase, Clerk, or other backend probes (v2).
- Hosted scanning with a browser (v2). A passive-lite web page is a stretch goal.
- Auto-deploying fixes.

## Success criteria
- Zero false positives on the known-good fixture site.
- Every planted issue in the bad fixture site detected.
- Scan of a typical site finishes in under 60 seconds.
- Install to first report in under 2 minutes for a non-coder.
