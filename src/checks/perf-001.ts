import { runLighthouse, type LighthouseAudit, type LighthouseSummary } from "../lighthouse.js";
import type { Check, Finding } from "../types.js";

export const MAX_TIPS = 3;
export const MIN_SAVING_MS = 300; // smaller savings are noise, not advice
const MAX_SCORE = 0.9; // an audit Lighthouse already rates good is not a tip
const TIME_METRICS = ["FCP", "LCP", "TBT", "INP"]; // all in ms; CLS is unitless and left out

interface Plain {
  title: string;
  why: string;
  fix: string;
}

const KNOWN: Record<string, Plain> = {
  "render-blocking-insight": {
    title: "Some files hold up your page until they finish downloading",
    why: "Visitors stare at a blank screen while these files load.",
    fix: "Load big scripts with defer or async, and only load the styles the first screen needs.",
  },
  "cache-insight": {
    title: "Returning visitors download your files again (no browser caching)",
    why: "Your files are not set to be remembered by the browser, so every visit re-downloads them.",
    fix: "Ask your host to send a long Cache-Control lifetime for images, scripts and styles.",
  },
  "document-latency-insight": {
    title: "Your page is slow to arrive (slow server, redirects or no compression)",
    why: "Everything else waits until the page itself has arrived.",
    fix: "Turn on compression (gzip or Brotli), avoid extra redirects, and check your hosting plan's response time.",
  },
  "image-delivery-insight": {
    title: "Your images are bigger than they need to be",
    why: "Large images make the page slow to appear, especially on phones.",
    fix: "Resize images to the size they are shown at and use modern formats such as WebP or AVIF.",
  },
  "lcp-discovery-insight": {
    title: "Your biggest image or heading is found late by the browser",
    why: "The part visitors look at first appears later than it could.",
    fix: "Put your main image directly in the page (no lazy loading) and mark it as high priority.",
  },
  "network-dependency-tree-insight": {
    title: "Files load one after another instead of at the same time",
    why: "Each file that has to wait for another adds to the loading time.",
    fix: "Avoid files that only load other files, and tell the browser early about sites it will need to connect to.",
  },
  "legacy-javascript-insight": {
    title: "Your JavaScript includes extra code that only very old browsers need",
    why: "Extra code makes every visitor download more than necessary.",
    fix: "Build for modern browsers only (set a modern target in your build tool).",
  },
  "duplicated-javascript-insight": {
    title: "The same JavaScript is included more than once",
    why: "Visitors download the same code twice.",
    fix: "Make sure each library is only bundled once (check for duplicate versions).",
  },
  "font-display-insight": {
    title: "Text stays invisible while your fonts download",
    why: "Visitors may see a blank space where the text should be.",
    fix: "Add font-display: swap to your font rules so text shows straight away.",
  },
  "third-parties-insight": {
    title: "Other companies' scripts slow your page down",
    why: "Scripts from other sites take time and are outside your control.",
    fix: "Remove third-party scripts you do not need, and load the rest late.",
  },
  "modern-http-insight": {
    title: "Your server uses an old, slower version of the web protocol",
    why: "Older versions send files one at a time.",
    fix: "Ask your host to turn on HTTP/2 or HTTP/3 (most hosts offer it for free).",
  },
  "dom-size-insight": {
    title: "Your page has a very large number of elements",
    why: "Big pages are slower to display and to react to taps.",
    fix: "Show less on the first screen and load the rest only when it is needed.",
  },
  "unminified-javascript": {
    title: "Your JavaScript files are bigger than they need to be (not minified)",
    why: "Visitors download extra spaces, comments and long names for nothing.",
    fix: "Turn on minification in your production build (most build tools do this by default).",
  },
  "unminified-css": {
    title: "Your style files are bigger than they need to be (not minified)",
    why: "Visitors download extra spaces and comments for nothing.",
    fix: "Turn on minification in your production build.",
  },
  "unused-javascript": {
    title: "Your page downloads a lot of JavaScript it never uses",
    why: "Visitors wait for code that does nothing on this page.",
    fix: "Split your code so each page only loads what it needs.",
  },
  "unused-css-rules": {
    title: "Your page downloads a lot of styling it never uses",
    why: "Visitors wait for styles that do nothing on this page.",
    fix: "Remove unused styles or split them per page.",
  },
  redirects: {
    title: "Visitors are sent through extra redirects before your page loads",
    why: "Every redirect adds a full round trip before anything shows.",
    fix: "Link straight to the final address and remove redirect chains.",
  },
  "server-response-time": {
    title: "Your server takes a long time to start answering",
    why: "Everything else waits until the server has replied.",
    fix: "Check your hosting plan, use caching, and avoid slow work before the page is sent.",
  },
};

function formatTime(ms: number): string {
  return ms < 1000 ? `${Math.round(ms / 10) * 10} ms` : `${(Math.round(ms / 100) / 10).toFixed(1)} s`;
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function savingMs(audit: LighthouseAudit): number {
  return Math.max(0, ...TIME_METRICS.map((metric) => audit.metricSavings?.[metric] ?? 0));
}

// The top tips by estimated saving. Informational: they never deduct from the score.
export function mapTips(summary: LighthouseSummary): Finding[] {
  return summary.audits
    .filter(
      (a) =>
        a.score !== null &&
        a.score < MAX_SCORE &&
        a.scoreDisplayMode !== "notApplicable" &&
        a.scoreDisplayMode !== "error" &&
        savingMs(a) >= MIN_SAVING_MS,
    )
    .sort((a, b) => savingMs(b) - savingMs(a) || a.id.localeCompare(b.id))
    .slice(0, MAX_TIPS)
    .map((a): Finding => {
      const known = KNOWN[a.id];
      const bytes = a.overallSavingsBytes ? ` and ${formatBytes(a.overallSavingsBytes)}` : "";
      return {
        checkId: "PERF-001",
        severity: "low",
        title: known?.title ?? `Speed tip: ${a.title}`,
        why: known?.why ?? "This slows down how quickly your page appears.",
        evidence: `Could save about ${formatTime(savingMs(a))}${bytes}`,
        fix: known?.fix ?? `Look up "${a.title}" on web.dev for how to fix it.`,
      };
    });
}

export function createPerf001(measure: (url: string) => Promise<LighthouseSummary> = runLighthouse): Check {
  return {
    id: "PERF-001",
    title: "Performance",
    category: "performance",
    mode: "passive",
    async run(ctx) {
      const summary = await measure(ctx.finalUrl);
      if (summary.score === null) throw new Error("Lighthouse could not work out a performance score");
      // The category score is Lighthouse's own, not deductions from findings.
      ctx.categoryScores.performance = Math.round(summary.score * 100);
      return mapTips(summary);
    },
  };
}

export const perf001: Check = createPerf001();
