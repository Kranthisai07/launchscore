# launchscore

Paste your URL. Find out if your vibe-coded app will get you hacked, sued, or ignored by Google.

## Setup

launchscore loads your site in a real browser (Chromium). Install it once:

```
npx playwright install chromium
```

## Usage

```
npx launchscore https://mysite.com
```

This writes three files into the current folder (use `-o <folder>` to write them somewhere else):

- `launchscore-report.json`: the full report, including the score and every finding.
- `launchscore-card.png` (1200x630): a share card for X and LinkedIn.
- `launchscore-card-square.png` (1080x1350): the same card for Instagram.

The score is out of 100. A critical issue blocks the launch no matter what else is fine. Categories that were not tested show "not tested" instead of a score, and a scan with untested parts can never say "READY TO LAUNCH". The cards show only the site name and the titles of the top issues, never evidence or secrets.

To try it without a real site, start a test site with `pnpm fixture good` (a clean site) or `pnpm fixture bad` (a site with planted problems). It prints a local address; scan that address, and press Ctrl+C to stop.

Work in progress: checks are being added milestone by milestone, so accessibility and performance are not tested yet.

## Third-party fonts

The share cards embed Archivo Black and JetBrains Mono under the SIL Open Font License 1.1. See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
