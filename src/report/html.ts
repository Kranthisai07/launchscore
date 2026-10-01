import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NotTested } from "../types.js";
import { CATEGORY_LABEL, escapeHtml as esc, PALETTE, tagsFor, toCardData, VERDICT_ACCENT } from "./card.js";
import { ARCHIVO_BLACK_400, JETBRAINS_MONO_500, JETBRAINS_MONO_700 } from "./fonts.js";
import type { Report } from "./json.js";

export const HTML_REPORT_FILENAME = "launchscore-report.html";
// A placeholder until the README gets its methodology section (M15).
export const METHODOLOGY_URL = "https://github.com/Kranthisai07/launchscore#methodology";

export interface HtmlReportOptions {
  cardPng?: Buffer; // the landscape share card, embedded when available
  version: string;
}

type Finding = Report["findings"][number];

const SEGMENTS = 20;
const SEVERITY_LABEL: Record<Finding["severity"], string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

// Speed tips are informational: they never change the score, so they get their own section.
const isSpeedTip = (f: Finding): boolean => f.checkId.startsWith("PERF-");

// Turns the short technical reason a check recorded into a sentence anyone can follow. The raw reason is
// always shown too, in small type, so nothing is hidden.
export function plainReason(reason: string): string {
  const count = /(\d+)/.exec(reason)?.[1] ?? "some";
  if (reason === "domain not verified") {
    return "This test is more active than the others, so it only runs on sites you have proven are yours.";
  }
  if (reason === "redirected to a different domain") {
    return "Your address sent us to a different website, so we skipped the tests that go beyond the public page.";
  }
  if (reason.startsWith("check failed:")) return "This test hit a problem and could not finish.";
  if (reason === "skipped (--no-perf)") return "You chose to skip the speed test.";
  if (/^scripts not scanned:/.test(reason)) {
    return "Some of your JavaScript files were too big or could not be read, so we could not look inside them for secret keys.";
  }
  if (/source maps? not checked/.test(reason)) {
    return `Your site points to more source map files (files that let anyone read your original code) than we check, so ${count} were skipped.`;
  }
  if (/links? not checked \(limit/.test(reason)) return `Your page has more links than we check, so ${count} were skipped.`;
  if (/links? not checked \(time limit\)/.test(reason)) return `Checking links took too long, so ${count} were skipped.`;
  if (reason.startsWith("broken links can't be checked")) {
    return "Your site shows a normal page for addresses that do not exist, so we cannot tell which links are broken.";
  }
  return reason;
}

function findingHtml(f: Finding, tag?: string): string {
  const label = tag ?? SEVERITY_LABEL[f.severity];
  return `<article class="finding sev-${f.severity}">
  <div class="head"><span class="sev">${esc(label)}</span><h3>${esc(f.title)}</h3></div>
  <p class="why"><span class="lbl">Why it matters</span> ${esc(f.why)}</p>
  <p class="fix"><span class="lbl">How to fix it</span> ${esc(f.fix)}</p>
  ${f.evidence ? `<p class="evidence"><span class="lbl">What we saw</span> <code>${esc(f.evidence)}</code></p>` : ""}
  <p class="id">${esc(f.checkId)}</p>
</article>`;
}

function section(id: string, heading: string, intro: string | undefined, body: string): string {
  return `<section id="${id}" aria-labelledby="${id}-h">
  <h2 id="${id}-h">${esc(heading)}</h2>
  ${intro ? `<p class="intro">${esc(intro)}</p>` : ""}
  ${body}
</section>`;
}

const empty = (text: string): string => `<p class="empty">${esc(text)}</p>`;

function categoryRow(c: Report["categories"][number]): string {
  const label = esc(CATEGORY_LABEL[c.name]);
  if (!c.tested || c.score === null) {
    return `<li class="cat untested"><span class="label">${label}</span><span class="note">NOT TESTED</span><span class="num">--</span></li>`;
  }
  const filled = Math.round((c.score / 100) * SEGMENTS);
  const segments = Array.from({ length: SEGMENTS }, (_, i) => `<i${i < filled ? ' class="on"' : ""}></i>`).join("");
  return `<li class="cat"><span class="label">${label}</span><span class="bar" role="img" aria-label="${label}: ${c.score} out of 100">${segments}</span><span class="num">${c.score}</span></li>`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function countLine(serious: number, medium: number, low: number): string {
  const total = serious + medium + low;
  if (total === 0) return "No problems found.";
  return `${plural(total, "thing", "things")} to look at: ${serious} serious, ${medium} medium, ${low} small.`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const text = date.toLocaleString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return `${text} UTC`;
}

const titleCase = (text: string): string => (text ? text[0].toUpperCase() + text.slice(1) : text);

function css(accent: string): string {
  return `
@font-face{font-family:"Archivo Black";font-weight:400;src:url(data:font/woff2;base64,${ARCHIVO_BLACK_400}) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-weight:500;src:url(data:font/woff2;base64,${JETBRAINS_MONO_500}) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-weight:700;src:url(data:font/woff2;base64,${JETBRAINS_MONO_700}) format("woff2")}
:root{--bg:${PALETTE.bg};--text:${PALETTE.text};--muted:${PALETTE.muted};--dim:${PALETTE.dim};--accent:${accent};--red:#FF2A2A;--amber:#F5A524;color-scheme:dark}
*{box-sizing:border-box;margin:0;padding:0;border-radius:0}
html{background:var(--bg);-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--text);font-family:"JetBrains Mono",monospace;font-weight:500;font-synthesis:none;font-size:16px;line-height:1.55;overflow-wrap:anywhere}
.wrap{max-width:880px;margin:0 auto;padding:24px 16px 48px}
h1,h2,h3{font-weight:700}
h2,.score,.verdict,.mark{font-family:"Archivo Black",sans-serif;font-weight:400}
a{color:var(--text);text-underline-offset:3px}
a:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.topbar{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline;color:var(--muted);font-size:14px;margin-bottom:24px}
.topbar .mark{color:var(--text);font-size:22px;letter-spacing:-.02em}
.hero{display:grid;grid-template-columns:1fr;gap:20px;border-top:2px solid var(--dim);border-bottom:2px solid var(--dim);padding:24px 0}
.score{display:flex;align-items:baseline;gap:.15em;color:var(--accent);font-size:clamp(96px,26vw,180px);line-height:.85;letter-spacing:-.05em}
.score small{font-family:"JetBrains Mono",monospace;font-weight:700;font-size:clamp(20px,4vw,30px);color:var(--muted);letter-spacing:0}
.hostname{font-size:clamp(20px,5vw,30px);line-height:1.2}
.verdict{display:inline-block;background:var(--accent);color:var(--bg);text-transform:uppercase;font-size:clamp(22px,6vw,36px);line-height:1.05;padding:12px 16px 14px;margin-top:12px}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.tag{border:2px solid var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:13px;padding:4px 10px}
.count{margin-top:14px;color:var(--muted)}
@media (min-width:720px){.hero{grid-template-columns:auto 1fr;gap:40px;align-items:center}}
section{margin-top:40px}
section>h2{font-size:clamp(22px,5vw,28px);line-height:1.15;margin-bottom:8px;letter-spacing:-.01em}
.intro,.note-line{color:var(--muted);margin-bottom:16px}
.empty{border:2px solid var(--dim);padding:14px 16px;color:var(--muted)}
ul{list-style:none}
.cats{border-top:1px solid var(--dim)}
.cat{display:grid;grid-template-columns:1fr auto;gap:6px 12px;align-items:center;border-bottom:1px solid var(--dim);padding:12px 0}
.cat .label{font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.cat .num{font-weight:700;text-align:right;font-size:18px}
.cat .bar,.cat .note{grid-column:1 / -1;grid-row:2}
.bar{display:flex;gap:3px;height:20px}
.bar i{flex:1;background:var(--dim)}
.bar i.on{background:var(--accent)}
.cat.untested .label,.cat.untested .num,.cat.untested .note{color:var(--muted)}
.note{font-weight:700;letter-spacing:.06em}
@media (min-width:560px){.cat{grid-template-columns:11rem 1fr 3.5rem}.cat .bar,.cat .note{grid-column:2;grid-row:1}}
.finding{border:2px solid var(--dim);border-left-width:8px;padding:14px 16px;margin-bottom:12px}
.finding.sev-critical,.finding.sev-high{border-left-color:var(--red)}
.finding.sev-medium{border-left-color:var(--amber)}
.finding.sev-low{border-left-color:var(--muted)}
.finding .head{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:baseline;margin-bottom:8px}
.finding h3{font-size:17px;line-height:1.3}
.sev{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;border:2px solid currentColor;padding:1px 8px;white-space:nowrap}
.sev-critical .sev,.sev-high .sev{color:var(--red)}
.sev-medium .sev{color:var(--amber)}
.sev-low .sev{color:var(--muted)}
.finding p{margin-top:6px}
.lbl{display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.evidence code{display:block;background:#151517;border:1px solid var(--dim);padding:8px 10px;margin-top:2px;font-family:inherit;font-size:14px;white-space:pre-wrap}
.id{color:var(--muted);font-size:12px;letter-spacing:.06em}
.item{border:2px solid var(--dim);padding:14px 16px;margin-bottom:12px}
.item h3{font-size:17px;line-height:1.3}
.item p{margin-top:6px}
.item .raw{color:var(--muted);font-size:14px}
.card-img{display:block;width:100%;height:auto;border:2px solid var(--dim)}
footer{margin-top:48px;border-top:2px solid var(--dim);padding-top:16px;color:var(--muted);font-size:14px;display:grid;gap:6px}
footer a{color:var(--text)}
`;
}

export function renderHtmlReport(report: Report, options: HtmlReportOptions): string {
  const data = toCardData(report);
  const accent = VERDICT_ACCENT[report.verdict];
  const tags = tagsFor(data);

  const tips = report.findings.filter(isSpeedTip);
  const problems = report.findings.filter((f) => !isSpeedTip(f));
  const serious = problems.filter((f) => f.severity === "critical" || f.severity === "high");
  const medium = problems.filter((f) => f.severity === "medium");
  const low = problems.filter((f) => f.severity === "low");
  const group = (list: Finding[], none: string): string => (list.length ? list.map((f) => findingHtml(f)).join("\n") : empty(none));

  const hero = `<header class="hero" id="score">
  <div class="score" aria-label="Score: ${report.score === null ? "not scored" : `${report.score} out of 100`}">${report.score === null ? "N/A" : report.score}${report.score === null ? "" : "<small>/100</small>"}</div>
  <div>
    <h1 class="hostname">${esc(data.hostname)}</h1>
    <p class="verdict">${esc(report.verdict)}</p>
    ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    <p class="count">${esc(countLine(serious.length, medium.length, low.length))}</p>
  </div>
</header>`;

  const categories = section(
    "categories",
    "Scores by area",
    undefined,
    `<ul class="cats">${report.categories.map(categoryRow).join("")}</ul>
  <p class="note-line">Performance is Google's own speed score. The other areas start at 100 and lose points for each problem found.</p>`,
  );

  const notTested = section(
    "not-checked",
    "What we couldn't check",
    "These were not tested, so they are not counted as passed.",
    report.notTested.length
      ? `<ul>${report.notTested
          .map(
            (n: NotTested) => `<li class="item">
  <h3>${esc(n.title)} <span class="id">${esc(n.checkId)}</span></h3>
  <p>${esc(plainReason(n.reason))}</p>
  <p class="raw">Details: ${esc(n.reason)}</p>
</li>`,
          )
          .join("\n")}</ul>`
      : empty("Everything we planned to check was checked."),
  );

  const detected = section(
    "detected",
    "Technology we spotted",
    "Not a problem, just useful to know. These do not change your score.",
    report.detected.length
      ? `<ul>${report.detected
          .map(
            (d) => `<li class="item">
  <h3>${esc(titleCase(d.stack))}${d.url ? ` <span class="id">${esc(d.url)}</span>` : ""}</h3>
  <p>${esc(d.note)}</p>
  <p class="id">${esc(d.checkId)}</p>
</li>`,
          )
          .join("\n")}</ul>`
      : empty("Nothing notable detected."),
  );

  const share = options.cardPng
    ? section(
        "share",
        "Share your score",
        "Save this picture to post your result. The same image is saved next to this report as launchscore-card.png, with a square version for Instagram.",
        `<img class="card-img" alt="${esc(`launchscore card for ${data.hostname}: ${report.score === null ? "not scored" : `${report.score} out of 100`}, ${report.verdict}`)}" width="1200" height="630" src="data:image/png;base64,${options.cardPng.toString("base64")}">`,
      )
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'">
<title>${esc(`launchscore report: ${data.hostname}`)}</title>
<style>${css(accent)}</style>
</head>
<body>
<div class="wrap">
<div class="topbar"><span class="mark">launchscore</span><span>Report for a site you asked us to check</span></div>
<main>
${hero}
${categories}
${section("fix-first", "Fix these first", "Serious problems that put your visitors or your launch at risk.", group(serious, "No critical or high issues found."))}
${section("fix-next", "Fix these next", "Worth doing before you launch.", group(medium, "No medium issues found."))}
${section("tidy-up", "Smaller things to tidy up", "Low risk. Do these when you have time.", group(low, "No small issues found."))}
${section(
  "speed-tips",
  "Speed tips",
  "Suggestions from Google's Lighthouse speed test. They do not change your score.",
  tips.length ? tips.map((f) => findingHtml(f, "Tip")).join("\n") : empty("No speed tips."),
)}
${detected}
${notTested}
${share}
</main>
<footer>
  <span>Scanned ${esc(formatTime(report.scannedAt))}</span>
  <span>launchscore ${esc(options.version)}</span>
  <a href="${METHODOLOGY_URL}" rel="noopener noreferrer">How scoring works</a>
</footer>
</div>
</body>
</html>
`;
}

export async function writeHtmlReport(html: string, dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, HTML_REPORT_FILENAME);
  await writeFile(file, html, "utf8");
  return file;
}
