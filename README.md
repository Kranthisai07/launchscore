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

This writes `launchscore-report.json` into the current folder. Use `-o <folder>` to write it somewhere else.

Work in progress: the checks themselves are being added milestone by milestone, so reports are empty for now.
