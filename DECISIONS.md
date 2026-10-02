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
