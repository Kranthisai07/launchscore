# Decisions log

Newest first. Each entry: what changed, why this approach, why not the alternatives.

## 2026-10-01: two false positives from the real-site validation (M10)

**SEC-002 reported open-source library maps as "your source code is exposed".**
- What: SEC-002 now (1) ignores maps on a host that is not the page's own site and never fetches them, and (2) for first-party maps, reports only when at least half of the sources look like the site's own code (`node_modules/` and `dist/` paths are library code).
- Why this shape: the two real cases differ. Segment's map is on `cdn.segment.com` (third-party host), but PostHog was proxied on `api.supermemory.ai` (first-party host) and its 131 sources are `../../core/dist/...` plus one `../src/utils/globals.ts`, none under `node_modules/`. A "not under node_modules" rule plus "at least one app-looking file" would still have flagged it, so the rule is a majority. Cost: a mixed map that is mostly `node_modules` with a few own files is missed. A miss is preferred over a false positive (CLAUDE.md).
- Same site: same hostname or same registrable domain, using a small last-two-labels rule plus common second-level suffixes (co.uk), with no Public Suffix List package (CLAUDE.md: keep dependencies minimal; a mistake only makes the check quieter). Hosting platforms where each customer gets a subdomain are matched by exact hostname only, using `src/data/hosting-suffixes.ts`, whose entries were each checked against the PRIVATE section of the Public Suffix List (commit 6cd82aff889e3d64e5e03bc5c1f43da1934a960a, 2026-10-01). Not in that list, so not included: v0.app, lovable.dev, railway.app.
- Rejected: a hand-written list of known SDK file paths (only covers SDKs we remembered to add).

**SEC-004 and the SEC-003 HSTS rule fired on whole-TLD HSTS-preloaded domains (.dev, .app, ...).**
- What: both are skipped when the final host's TLD is in `src/data/hsts-preloaded-tlds.ts`.
- Why: browsers upgrade http:// to https:// for those TLDs by themselves, so the missing header or redirect cannot affect a visitor.
- The list is not hand-written: it is every dotless entry (51 of 94,778) in Chromium's `transport_security_state_static.json` at commit d5e6fd51b430fec89732a3976e666011ecffa0a2 (2026-09-11), all `public-suffix`, `force-https`, `include_subdomains: true`. `.com` is not on it.

## 2026-10-01: pnpm validate never overwrites a review.md that holds verdicts

- What: before writing, `runValidation` reads `validation/review.md`. If any row has something in its Verdict cell (TP, FP, unsure or any other text), or a table line cannot be read as a row, the file is left byte-for-byte untouched and the new table goes to `review-<timestamp>.md` (and `-2`, `-3` if that name exists). The CLI says so. An unmarked or missing review.md is regenerated as before.
- Why: an earlier run already replaced a table the user had started marking. Unreadable files count as marked because refusing to overwrite is the safe failure. `summary.md` is still rewritten each run: it holds no human input.

## 2026-10-02: pages that never fire "load"; validate honours robots.txt

- Navigation (`src/context.ts`): `goto` now waits for `domcontentloaded` (30 s), then `load` for up to 15 s, then `networkidle` for up to 5 s; the last two are best effort and the scan continues if they time out. Why: round-2 validation had a site that rendered but never fired "load", and the old `goto(..., "load")` failed the whole scan after 30 s. Proven by a fixture page that holds an image open forever: the new test fails on the old code ("page.goto: Timeout 30000ms exceeded") and passes now. The timeouts are `ContextOptions` so tests can shorten them.
- `pnpm validate` only: before each site it fetches `/robots.txt` and skips the site (logged as "skipped: site disallows automated access", listed in review.md and summary.md) when `User-agent: *` disallows `/` (or `/*`) and has no `Allow: /`. Only that exact case counts: partial blocks, other bots' rules, a missing file and non-robots responses (HTML) do not. The CLI is unchanged because it is run by the site's owner on purpose; the harness is the bulk tool that touches sites on a list.

## 2026-10-02: round-2 fixes: context-aware placeholders, platform defaults, canonical host, hosting advice

Round 2 (22 vibe-coded sites): 221 TP, 4 FP, 1 unsure after review. All 4 false positives were HYG-003.
- **HYG-003** ("Your Company" matched ordinary prose): placeholder phrases are now Title Case only, and "Your Company" / "Company Name" count only in a placeholder context (followed by Name/Inc/LLC/Ltd/Logo, right after a copyright mark, or the whole text of an element). Overlapping matches merge into one finding. Chosen over plain case-sensitivity because "Grow Your Company Faster" and a "Company Name" form field are Title Case too. Cost: a placeholder in running text such as "Welcome to Your Company" is no longer caught (a miss, preferred over a false positive). The planted fixture text changed from "Welcome to Your Company" to a heading that is exactly "Your Company". A second finding covers placeholder values in the title and link-preview tags (syntro-astro.vercel.app is the real example); the canonical link is left to SEO-005 so one bad address is not reported twice.
- **SEC-004 and HSTS preload**: checked Chromium's list for bolt.host, lovable.app, vercel.app and netlify.app. None has a domain entry; lovable.app, vercel.app and netlify.app are only covered by the `.app` TLD entry (already skipped) and bolt.host is not covered at all, so the 5 `.bolt.host` SEC-004 rows are real (marked TP) and the skip is not extended. On a hosting-platform host the fix text no longer says "turn on a redirect" (the owner usually cannot): it says the host serves http without redirecting and suggests checking the host's https setting or connecting a custom domain.
- **SEO-002 on uds.bolt.host and syntro-astro.vercel.app**: no change. uds has the full og set in its raw HTML (no SEO-002 finding was ever reported); syntro has two og:image tags, SEO-002 reads the first (`/og-image.png`, relative, a true finding) and the second is the template placeholder, which HYG-003 now reports.
- **SEO-006 (new)**: Lovable defaults left in place. Verified on live unedited Lovable sites because Lovable has no public template repo; medium when the title, description or og:image is default, low when only twitter:site and/or author remain. Bolt/v0 defaults are not checked: none could be verified from a fresh project or official template.
- **SEO-005 canonical host**: medium when the canonical is on another site, except a preview copy on a hosting platform's default address pointing at the owner's own custom domain (uds.bolt.host to ultimatesolutions.in is correct practice). Same-site logic reuses `isSameSite` and the hosting suffix list.
- Fixture note: one page cannot both lack a canonical and have a wrong one, so the bad fixture now plants the wrong canonical; "no canonical" stays unit-tested. The bad fixture has 30 findings (was 28) and 19 checks are registered.

## 2026-10-02: SEC-003 is one low finding per site (M10 calibration)

- What: SEC-003 now returns one finding per site, severity low, titled "Your site is missing some browser security settings". The evidence lists the missing headers ("Not sent by <url>: Content-Security-Policy, X-Content-Type-Options, ..."), the fix explains each missing one in a plain sentence. The HSTS preloaded-TLD skip and the http-page skip for HSTS are unchanged. The bad fixture goes from 30 to 27 findings (SEC-003 x4 becomes x1); the good fixture stays clean.
- Why: M10 data showed SEC-003 was 64 of 248 findings and fired on every site, so it buried the findings that matter. Each header is defence in depth, not a hole by itself, so a single low finding says the same thing without dominating the report or the score. A missing Content Security Policy used to be medium; it is now part of the low finding (a deliberate loss of weight for the one header that matters most, accepted because real sites almost never have one and the old severity penalised all of them equally).
- Rejected: keeping per-header findings with lower severities (still four rows per site), or dropping the check (it is true and cheap advice).
- M10 is ticked: 30 real sites (Lovable, Bolt, Vercel, personal), 3 false-positive patterns fixed, 3 gaps turned into checks, 2 robustness fixes.

## 2026-10-02: README rewrite with animated SVG hero and terminal demo

- What: new `README.md`, `docs/hero.svg`, `docs/terminal.svg`, `docs/card-example.png`, and `scripts/make-card-example.ts`. `docs/hero.svg` and `docs/terminal.svg` did not exist before (nothing in git history), so both were built from scratch.
- Why SVG with CSS keyframes: GitHub shows README images in an `<img>`, so scripts and external fonts do not run. Fonts are embedded as base64 from `src/report/fonts.ts` (same as the share card) and `prefers-reduced-motion` shows the final state. Rejected: GIF or video (large, blurry, no reduced-motion), asciinema or JS players (do not run on GitHub).
- Honesty: the README says plainly that the npm package, Claude Code plugin, `launchscore verify`, and the database tests are not built. The install line is the from-source one, because `npx launchscore` does not work until M16.
- Numbers: the hero scores 12, 52, 78, 100 come from running `computeScore` over the bad fixture's findings with one group of areas fixed at a time (security, then SEO and accessibility, then hygiene and performance). The terminal output is a real run on the bad fixture. `docs/card-example.png` comes from our own card renderer, with only the address swapped.
- Corrections to old README text: removed "launch checks for links, favicon and console errors are still to come" (HYG-004 to HYG-006 exist); `npx` usage moved to roadmap.
- Not changed (code, per the task): the share card footer still prints `npx launchscore`, and `tests/card.browser.test.ts` and `tests/validate.browser.test.ts` still expect 27 findings while the bad fixture now yields 30.
