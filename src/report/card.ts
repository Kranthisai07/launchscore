import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import type { CategoryScore, Verdict } from "../score.js";
import type { Report } from "./json.js";
import { ARCHIVO_BLACK_400, JETBRAINS_MONO_500, JETBRAINS_MONO_700 } from "./fonts.js";

export type CardSize = "landscape" | "square";

export const CARD_SIZES: Record<CardSize, { width: number; height: number; file: string }> = {
  landscape: { width: 1200, height: 630, file: "launchscore-card.png" }, // X / LinkedIn
  square: { width: 1080, height: 1350, file: "launchscore-card-square.png" }, // Instagram
};

// Tactical-telemetry palette: off-black (never pure black), off-white, one accent that follows the verdict.
export const PALETTE = { bg: "#0B0B0C", text: "#F2F2EE", muted: "#8A8A90", dim: "#2A2A2E" };

export const VERDICT_ACCENT: Record<Verdict, string> = {
  "READY TO LAUNCH": "#35C46A",
  "ALMOST READY": "#F5A524",
  "NEEDS WORK": "#FF2A2A",
  "BLOCKED: CRITICAL ISSUE": "#FF2A2A",
  "NOT SCORED": "#9A9A9A",
};

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export const CATEGORY_LABEL: Record<CategoryScore["name"], string> = {
  security: "Security",
  seo: "SEO",
  accessibility: "Accessibility",
  performance: "Performance",
  hygiene: "Hygiene",
};

// The only data the card ever sees. Evidence, explanations, fixes and full URLs never get in here.
export interface CardData {
  hostname: string;
  score: number | null;
  verdict: Verdict;
  partial: boolean;
  verified: boolean;
  databaseNotTested: boolean;
  categories: CategoryScore[];
  issues: string[]; // titles only
}

export function toCardData(report: Report): CardData {
  const issues = report.findings
    .map((f, index) => ({ title: f.title, rank: SEVERITY_RANK[f.severity], index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, 3)
    .map((f) => f.title);
  return {
    hostname: new URL(report.url).hostname,
    score: report.score,
    verdict: report.verdict,
    partial: report.partial,
    verified: report.verified,
    databaseNotTested: !report.verified && report.detected.some((d) => d.stack === "supabase"),
    categories: report.categories,
    issues,
  };
}

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const SEGMENTS = 20;

function categoryRow(category: CategoryScore): string {
  const label = escapeHtml(CATEGORY_LABEL[category.name]);
  if (!category.tested || category.score === null) {
    return `<div class="row untested"><span class="label">${label}</span><span class="note">NOT TESTED</span><span class="num">--</span></div>`;
  }
  const filled = Math.round((category.score / 100) * SEGMENTS);
  const segments = Array.from({ length: SEGMENTS }, (_, i) => `<i${i < filled ? ' class="on"' : ""}></i>`).join("");
  return `<div class="row"><span class="label">${label}</span><span class="bar">${segments}</span><span class="num">${category.score}</span></div>`;
}

function css(size: CardSize, accent: string): string {
  const { width, height } = CARD_SIZES[size];
  return `
@font-face{font-family:"Archivo Black";font-weight:400;src:url(data:font/woff2;base64,${ARCHIVO_BLACK_400}) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-weight:500;src:url(data:font/woff2;base64,${JETBRAINS_MONO_500}) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-weight:700;src:url(data:font/woff2;base64,${JETBRAINS_MONO_700}) format("woff2")}
:root{--bg:${PALETTE.bg};--text:${PALETTE.text};--muted:${PALETTE.muted};--dim:${PALETTE.dim};--accent:${accent}}
*{box-sizing:border-box;margin:0;padding:0;border-radius:0}
html,body{width:${width}px;height:${height}px;background:var(--bg);color:var(--text);font-family:"JetBrains Mono",monospace;font-weight:500;font-synthesis:none;overflow:hidden}
.card{width:${width}px;height:${height}px;display:grid;overflow:hidden}
.display{font-family:"Archivo Black",sans-serif;font-weight:400}
.hostname{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.score{display:flex;align-items:baseline;gap:.12em;color:var(--accent);line-height:.8}
.score .n{letter-spacing:-.05em}
.score .of{font-family:"JetBrains Mono",monospace;font-weight:700;color:var(--muted)}
.verdict{display:inline-block;background:var(--accent);color:var(--bg);text-transform:uppercase;text-wrap:balance;line-height:1.02;letter-spacing:-.01em}
.tags{display:flex;flex-wrap:wrap;gap:10px}
.tag{border:2px solid var(--muted);color:var(--text);font-weight:700;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
.cats{display:flex;flex-direction:column}
.row{display:grid;grid-template-columns:var(--label) 1fr var(--numw);align-items:center;gap:18px;border-top:1px solid var(--dim)}
.row:first-child{border-top:0}
.label{font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.bar{display:flex;gap:3px;height:var(--barh)}
.bar i{flex:1;background:var(--dim)}
.bar i.on{background:var(--accent)}
.num{font-weight:700;text-align:right}
.row.untested .label,.row.untested .num,.row.untested .note{color:var(--muted)}
.note{font-weight:700;letter-spacing:.06em}
.issues h2{font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
.issues li{list-style:none;display:grid;grid-template-columns:auto 1fr;gap:12px}
.issues li b{color:var(--accent);font-weight:700}
.issues li span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.none{color:var(--text);font-weight:700}
.brand{display:flex;align-items:baseline;gap:16px;white-space:nowrap}
.brand .mark{letter-spacing:-.02em}
.brand .cmd{color:var(--muted);font-weight:500}
${size === "landscape" ? landscapeCss() : squareCss()}`;
}

function landscapeCss(): string {
  return `
.card{grid-template-columns:520px 1fr;grid-template-rows:auto auto 1fr auto;grid-template-areas:"hero host" "hero cats" "hero issues" "brand issues"}
.hero{grid-area:hero;padding:40px 36px 0 44px;border-right:2px solid var(--dim);display:flex;flex-direction:column;gap:26px}
.score .n{font-size:268px}.score.three .n{font-size:190px}.score .of{font-size:34px}
.verdict{font-size:42px;padding:14px 18px 16px}
.tag{font-size:22px;padding:6px 12px}
.host{grid-area:host;padding:34px 44px 0 40px;font-size:34px}
.cats{grid-area:cats;padding:14px 44px 0 40px;--label:196px;--numw:56px;--barh:22px}
.row{height:46px}.label{font-size:23px}.num{font-size:26px}.note{font-size:22px}
.issues{grid-area:issues;padding:18px 44px 28px 40px;display:flex;flex-direction:column;gap:12px;min-height:0}
.issues h2{font-size:22px}.issues ul{display:flex;flex-direction:column;gap:10px}
.issues li{font-size:23px;line-height:1.22}.none{font-size:26px}
.brand{grid-area:brand;padding:0 36px 30px 44px}
.brand .mark{font-size:30px}.brand .cmd{font-size:22px}`;
}

function squareCss(): string {
  return `
.card{grid-template-columns:1fr;grid-template-rows:auto auto auto auto 1fr;grid-template-areas:"brand" "host" "hero" "cats" "issues";padding:46px 64px 44px;row-gap:0}
.brand{grid-area:brand;justify-content:space-between}
.brand .mark{font-size:40px}.brand .cmd{font-size:28px}
.host{grid-area:host;padding-top:16px;font-size:40px}
.hero{grid-area:hero;padding-top:10px;display:flex;flex-direction:column;gap:18px}
.score .n{font-size:370px}.score .of{font-size:46px}
.verdict{font-size:54px;padding:16px 24px 18px;align-self:flex-start}
.tag{font-size:26px;padding:7px 14px}
.cats{grid-area:cats;padding-top:24px;--label:290px;--numw:76px;--barh:28px}
.row{height:58px;gap:22px}.label{font-size:30px}.num{font-size:36px}.note{font-size:28px}
.issues{grid-area:issues;padding-top:24px;display:flex;flex-direction:column;gap:14px;min-height:0}
.issues h2{font-size:26px}.issues ul{display:flex;flex-direction:column;gap:12px}
.issues li{font-size:29px;line-height:1.2}.none{font-size:34px}`;
}

// The small labels shown beside the verdict, on the card and in the report.
export function tagsFor(data: CardData): string[] {
  const tags: string[] = [];
  if (data.partial) tags.push("Partial scan");
  if (data.verified) tags.push("Verified");
  else if (data.databaseNotTested) tags.push("Database not tested");
  return tags;
}

export function cardHtml(data: CardData, size: CardSize): string {
  const accent = VERDICT_ACCENT[data.verdict];
  const tags = tagsFor(data);

  const issues =
    data.issues.length === 0
      ? `<p class="none">NO ISSUES FOUND</p>`
      : `<ul>${data.issues.map((t) => `<li><b>&gt;</b><span>${escapeHtml(t)}</span></li>`).join("")}</ul>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>launchscore</title><style>${css(size, accent)}</style></head>
<body><div class="card ${size}">
  <div class="brand"><span class="mark display">launchscore</span><span class="cmd">npx launchscore</span></div>
  <div class="host hostname">${escapeHtml(data.hostname)}</div>
  <div class="hero">
    <div class="score${data.score === null || data.score >= 100 ? " three" : ""}"><span class="n display">${data.score === null ? "N/A" : data.score}</span>${data.score === null ? "" : '<span class="of">/100</span>'}</div>
    <div><span class="verdict display">${escapeHtml(data.verdict)}</span></div>
    ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
  </div>
  <div class="cats">${data.categories.map(categoryRow).join("")}</div>
  <div class="issues"><h2>Top issues</h2>${issues}</div>
</div></body></html>`;
}

// Renders both cards to PNG bytes in one browser session. Nothing is written to disk.
export async function renderCardImages(report: Report): Promise<Record<CardSize, Buffer>> {
  const data = toCardData(report);
  const browser = await chromium.launch();
  try {
    const images = {} as Record<CardSize, Buffer>;
    for (const [size, { width, height }] of Object.entries(CARD_SIZES) as [CardSize, (typeof CARD_SIZES)[CardSize]][]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      await page.setContent(cardHtml(data, size), { waitUntil: "load" });
      await page.evaluate("document.fonts.ready.then(() => true)");
      images[size] = await page.screenshot({ type: "png" });
      await page.close();
    }
    return images;
  } finally {
    await browser.close();
  }
}

export async function writeCardImages(images: Record<CardSize, Buffer>, dir: string): Promise<string[]> {
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  for (const [size, { file }] of Object.entries(CARD_SIZES) as [CardSize, (typeof CARD_SIZES)[CardSize]][]) {
    const target = path.join(dir, file);
    await writeFile(target, images[size]);
    written.push(target);
  }
  return written;
}

export async function renderCards(report: Report, dir: string): Promise<string[]> {
  return writeCardImages(await renderCardImages(report), dir);
}
