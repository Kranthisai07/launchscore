# launchscore

Paste your URL. Find out if your vibe-coded app will get you hacked, sued, or ignored by Google.

## Setup

launchscore needs Node 22.19 or newer. It loads your site in a real browser (Chromium); install that once:

```
npx playwright install chromium
```

## Usage

```
npx launchscore https://mysite.com
```

The scan takes about 15 to 30 seconds, most of it the speed test. Add `--no-perf` to skip the speed test (it is slow on big sites); performance then shows as not tested.

Add `--open` to open the web report in your browser when the scan finishes. When you run it in a terminal it waits for Enter at the end, so a window opened just for it does not close before you can read the result; add `--no-wait` to skip that (scripts and CI never wait).

This writes four files into the current folder (use `-o <folder>` to write them somewhere else):

- `launchscore-report.html`: the report to read. One page that works offline, in plain English: your score, what to fix first and how, and what we could not check. It looks fine on a phone.
- `launchscore-report.json`: the same report as data, including the score and every finding (the Claude Code plugin reads this one).
- `launchscore-card.png` (1200x630): a share card for X and LinkedIn.
- `launchscore-card-square.png` (1080x1350): the same card for Instagram.

The score is out of 100. A critical issue blocks the launch no matter what else is fine. Categories that were not tested show "not tested" instead of a score, and a scan with untested parts can never say "READY TO LAUNCH". The cards show only the site name and the titles of the top issues, never evidence or secrets.

To try it without a real site, start a test site with `pnpm fixture good` (a clean site) or `pnpm fixture bad` (a site with planted problems). It prints a local address; scan that address, and press Ctrl+C to stop.

Work in progress: checks are being added milestone by milestone. Launch checks for links, favicon and console errors are still to come.

## Third-party fonts

The share cards embed Archivo Black and JetBrains Mono under the SIL Open Font License 1.1. See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
