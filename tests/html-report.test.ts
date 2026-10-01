import { describe, expect, it } from "vitest";
import { METHODOLOGY_URL, plainReason, renderHtmlReport } from "../src/report/html.js";
import { type Report } from "../src/report/json.js";
import { computeScore } from "../src/score.js";
import { finding, makeReport } from "./helpers/report.js";

const render = (report: Report, cardPng?: Buffer) => renderHtmlReport(report, { cardPng, version: "9.9.9" });
const sectionOf = (html: string, id: string): string => {
  const match = new RegExp(`<section id="${id}"[\\s\\S]*?</section>`).exec(html);
  if (!match) throw new Error(`section ${id} not found`);
  return match[0];
};
const IDS = ["categories", "fix-first", "fix-next", "tidy-up", "speed-tips", "detected", "not-checked"];

const ALL = ["security", "seo", "accessibility", "performance", "hygiene"] as const;
const full = (): Report => {
  const findings = [
    finding("A secret key is visible", "critical", "sk_l…FAKE (in /app.js)", { checkId: "SEC-001", why: "Anyone can use it.", fix: "Replace the key." }),
    finding("Your page has no title", "high", "No <title> found", { checkId: "SEO-001", why: "Google has nothing to show.", fix: "Add a title." }),
    finding("No Content Security Policy", "medium", "Not sent by http://x/", { checkId: "SEC-003", why: "A script could take over.", fix: "Add the header." }),
    finding("No terms link", "low", "No link found", { checkId: "HYG-002", why: "Little protection.", fix: "Add a terms page." }),
    finding("Your JavaScript is not minified", "low", "Could save about 8.1 s", { checkId: "PERF-001", why: "Slower pages.", fix: "Turn on minification." }),
  ];
  const s = computeScore({
    findings: [
      { category: "security", severity: "critical" },
      { category: "seo", severity: "high" },
      { category: "security", severity: "medium" },
      { category: "hygiene", severity: "low" },
    ],
    testedCategories: ALL,
    directScores: { performance: 57 },
  });
  return makeReport(
    {
      findings,
      detected: [{ checkId: "SEC-005", stack: "supabase", url: "abc.supabase.co", note: "This site uses Supabase." }],
      notTested: [{ checkId: "SEC-006", title: "Database test", reason: "domain not verified" }],
      score: s.score,
      verdict: s.verdict,
      categories: s.categories,
      partial: false,
    },
    undefined,
  );
};

describe("sections", () => {
  it("has every section, each with a heading, in the requested order", () => {
    const html = render(full(), Buffer.from("png"));
    const positions = [...IDS, "share"].map((id) => html.indexOf(`<section id="${id}"`));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html.indexOf('id="score"')).toBeLessThan(positions[0]); // the score block comes first
    expect(html.indexOf("<footer>")).toBeGreaterThan(positions[positions.length - 1]); // the footer comes last
    const headings = [...html.matchAll(/<h2 id="[^"]+">([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(headings).toEqual([
      "Scores by area",
      "Fix these first",
      "Fix these next",
      "Smaller things to tidy up",
      "Speed tips",
      "Technology we spotted",
      "What we couldn&#39;t check",
      "Share your score",
    ]);
  });

  it("has exactly one h1, the hostname", () => {
    const html = render(full());
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/<h1 class="hostname">shop\.example\.org<\/h1>/);
  });

  it("puts critical and high first, then medium, then low, and speed tips apart", () => {
    const html = render(full());
    const first = sectionOf(html, "fix-first");
    expect(first).toContain("A secret key is visible");
    expect(first).toContain("Your page has no title");
    expect(first).not.toContain("No Content Security Policy");
    expect(first.indexOf("A secret key is visible")).toBeLessThan(first.indexOf("Your page has no title"));
    expect(sectionOf(html, "fix-next")).toContain("No Content Security Policy");
    const low = sectionOf(html, "tidy-up");
    expect(low).toContain("No terms link");
    expect(low).not.toContain("not minified");
    const tips = sectionOf(html, "speed-tips");
    expect(tips).toContain("Your JavaScript is not minified");
    expect(tips).toContain(">Tip<");
  });

  it("shows each finding's title, why, fix, evidence and a muted check id", () => {
    const first = sectionOf(render(full()), "fix-first");
    for (const text of ["A secret key is visible", "Anyone can use it.", "Replace the key.", "sk_l…FAKE (in /app.js)"]) expect(first).toContain(text);
    expect(first).toContain('<p class="id">SEC-001</p>');
    expect(first).toContain("sev-critical");
    expect(first).toContain(">Critical<");
  });

  it("keeps findings in their original order inside a group", () => {
    const report = makeReport({
      findings: [finding("First low", "low"), finding("Second low", "low"), finding("Third low", "low")],
    });
    const low = sectionOf(render(report), "tidy-up");
    expect(low.indexOf("First low")).toBeLessThan(low.indexOf("Second low"));
    expect(low.indexOf("Second low")).toBeLessThan(low.indexOf("Third low"));
  });

  it("counts the problems in plain words, leaving speed tips out", () => {
    expect(render(full())).toContain("4 things to look at: 2 serious, 1 medium, 1 small.");
    expect(render(makeReport({ findings: [finding("One", "low")] }))).toContain("1 thing to look at: 0 serious, 0 medium, 1 small.");
  });
});

describe("hero", () => {
  it("shows the score, the verdict and the hostname only, never a path, query or port", () => {
    const html = render(makeReport());
    expect(html).toContain(">shop.example.org<");
    expect(html).toContain("<title>launchscore report: shop.example.org</title>");
    for (const hidden of ["private", "SECRET-QUERY", "8443", "frag"]) expect(html).not.toContain(hidden);
    expect(html).toContain("READY TO LAUNCH");
    expect(html).toContain("100<small>/100</small>");
  });

  it("shows the tags", () => {
    const supabase = [{ checkId: "SEC-005", stack: "supabase", note: "n" }];
    const html = render(makeReport({ partial: true, detected: supabase }));
    expect(html).toContain(">Partial scan<");
    expect(html).toContain(">Database not tested<");
    expect(render(makeReport({ verified: true }))).toContain(">Verified<");
    expect(render(makeReport())).not.toContain('class="tag"');
  });

  it("says N/A when nothing could be scored", () => {
    const html = render(makeReport({}, { findings: [], testedCategories: [] }));
    expect(html).toContain(">N/A<");
    expect(html).toContain("NOT SCORED");
  });

  it("uses the verdict's accent colour", () => {
    expect(render(makeReport({}, { findings: [{ category: "security", severity: "critical" }], testedCategories: ALL }))).toContain("--accent:#FF2A2A");
    expect(render(makeReport())).toContain("--accent:#35C46A");
  });
});

describe("category bars", () => {
  it("fill 20 segments in proportion, with an accessible label", () => {
    const html = render(full());
    const row = /<li class="cat"><span class="label">Security<\/span>[\s\S]*?<\/li>/.exec(html)![0];
    expect(row).toContain('aria-label="Security: 25 out of 100"'); // 100 - critical 60 - medium 15
    expect(row.match(/<i class="on">/g)).toHaveLength(5); // 25 of 100 fills 5 of 20 segments
    expect(row.match(/<i/g)).toHaveLength(20);
  });

  it("greys out untested areas with NOT TESTED and no number", () => {
    const report = makeReport({}, { findings: [], testedCategories: ["security"] });
    const html = render(report);
    expect(html.match(/class="cat untested"/g)).toHaveLength(4);
    expect(html.match(/NOT TESTED/g)).toHaveLength(4);
  });
});

describe("empty states", () => {
  const clean = () => render(makeReport());

  it.each([
    ["fix-first", "No critical or high issues found."],
    ["fix-next", "No medium issues found."],
    ["tidy-up", "No small issues found."],
    ["speed-tips", "No speed tips."],
    ["detected", "Nothing notable detected."],
    ["not-checked", "Everything we planned to check was checked."],
  ])("%s says %j", (id, text) => {
    expect(sectionOf(clean(), id)).toContain(text);
  });

  it("says there were no problems at the top", () => {
    expect(clean()).toContain("No problems found.");
  });

  it("keeps every heading even when everything is empty", () => {
    const html = clean();
    for (const id of IDS) expect(html).toContain(`<section id="${id}"`);
  });
});

describe("detected technology", () => {
  it("shows the technology, its host, the note and the check id", () => {
    const detected = sectionOf(render(full()), "detected");
    expect(detected).toContain(">Supabase");
    expect(detected).toContain("abc.supabase.co");
    expect(detected).toContain("This site uses Supabase.");
    expect(detected).toContain("SEC-005");
    expect(detected).toContain("Not a problem");
  });
});

describe("what we couldn't check", () => {
  const entries = [
    { checkId: "SEC-006", title: "Database test", reason: "domain not verified" },
    { checkId: "SEC-009", title: "Deep probe", reason: "redirected to a different domain" },
    { checkId: "PERF-001", title: "Performance", reason: "check failed: Lighthouse timed out after 60 s" },
    { checkId: "PERF-001", title: "Performance", reason: "skipped (--no-perf)" },
    { checkId: "CONTEXT", title: "JavaScript files not scanned", reason: "scripts not scanned: 3 file(s)" },
    { checkId: "SEC-002", title: "Public source maps", reason: "5 source maps not checked (limit 20)" },
    { checkId: "HYG-006", title: "Broken internal links", reason: "10 links not checked (limit 50)" },
    { checkId: "HYG-006", title: "Broken internal links", reason: "2 links not checked (time limit)" },
    { checkId: "HYG-006", title: "Broken internal links", reason: "broken links can't be checked: site returns the home page for every address" },
    { checkId: "X-1", title: "Something new", reason: "a reason nobody has written a sentence for" },
  ];

  it("renders every entry's title, check id and raw reason", () => {
    const html = sectionOf(render(makeReport({ notTested: entries })), "not-checked");
    for (const e of entries) {
      expect(html).toContain(e.title.replace(/'/g, "&#39;"));
      expect(html).toContain(e.checkId);
      expect(html).toContain(`Details: ${e.reason.replace(/'/g, "&#39;")}`);
    }
    expect(html.match(/<li class="item">/g)).toHaveLength(entries.length);
  });

  it.each([
    ["domain not verified", "only runs on sites you have proven are yours"],
    ["redirected to a different domain", "sent us to a different website"],
    ["check failed: boom", "hit a problem and could not finish"],
    ["skipped (--no-perf)", "chose to skip the speed test"],
    ["scripts not scanned: 3 file(s)", "could not look inside them for secret keys"],
    ["5 source maps not checked (limit 20)", "more source map files"],
    ["10 links not checked (limit 50)", "more links than we check, so 10 were skipped"],
    ["2 links not checked (time limit)", "took too long, so 2 were skipped"],
    ["broken links can't be checked: site returns the home page for every address", "shows a normal page for addresses that do not exist"],
  ])("turns %j into a plain sentence", (reason, phrase) => {
    expect(plainReason(reason)).toContain(phrase);
  });

  it("falls back to the raw reason for one it does not know", () => {
    expect(plainReason("a reason nobody has written a sentence for")).toBe("a reason nobody has written a sentence for");
  });
});

describe("escaping", () => {
  const hostile = (label: string) => [`<script>alert("${label}")</script>`, `"><img src=x onerror=alert('${label}')>`, "&amp; `tick` 'q' \"dq\""].join(" ");
  const report = () =>
    makeReport(
      {
        url: 'https://shop.example.org/',
        findings: [
          finding(hostile("title"), "critical", hostile("evidence"), { why: hostile("why"), fix: hostile("fix"), checkId: hostile("id") }),
          finding(hostile("title2"), "low", hostile("e2"), { checkId: "PERF-001", why: hostile("why2"), fix: hostile("fix2") }),
        ],
        detected: [{ checkId: hostile("did"), stack: hostile("stack"), url: hostile("durl"), note: hostile("note") }],
        notTested: [{ checkId: hostile("nid"), title: hostile("ntitle"), reason: hostile("reason") }],
      },
      { findings: [{ category: "security", severity: "critical" }], testedCategories: ALL },
    );

  it("never lets a hostile string through as markup", () => {
    const html = render(report(), Buffer.from("png"));
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img src=x/i);
    expect(html).not.toMatch(/<[^>]*\sonerror=/i);
    expect(html.match(/<img\b/g)).toHaveLength(1); // only the share card
    for (const label of ["title", "evidence", "why", "fix", "id", "title2", "e2", "why2", "fix2", "did", "stack", "durl", "note", "nid", "ntitle", "reason"]) {
      expect(html, label).toContain(`&lt;script&gt;alert(&quot;${label}&quot;)&lt;/script&gt;`);
      expect(html, label).toContain(`&quot;&gt;&lt;img src=x onerror=alert(&#39;${label}&#39;)&gt;`);
    }
  });

  it("escapes ampersands, quotes and backticks too", () => {
    const html = render(report());
    expect(html).toContain("&amp;amp; `tick` &#39;q&#39; &quot;dq&quot;");
  });

  it("escapes the card's alt text", () => {
    const html = render(makeReport({ url: "https://a.example/" }), Buffer.from("png"));
    expect(html).toMatch(/<img class="card-img" alt="launchscore card for a\.example: 100 out of 100, READY TO LAUNCH"/);
  });
});

describe("self-contained and safe", () => {
  const html = render(full(), Buffer.from("png"));
  const bodyOnly = html.replace(/<style>[\s\S]*?<\/style>/, "");

  it("has no script at all", () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it("makes no request to anywhere but itself, apart from the one link a reader can click", () => {
    const external = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/gi)].map((m) => m[1]);
    expect(external).toEqual([METHODOLOGY_URL]);
    expect(html).not.toMatch(/url\((?!data:)/i);
    expect(html).not.toContain("@import");
    expect(html).not.toMatch(/<link\b/i);
  });

  it("forbids loading anything else with a Content-Security-Policy", () => {
    expect(html).toContain(`http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"`);
  });

  it("has a language, a viewport and a title", () => {
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1"');
    expect(html).toMatch(/<title>launchscore report: shop\.example\.org<\/title>/);
  });

  it("never uses an em dash or an en dash in its own text", () => {
    expect(bodyOnly).not.toMatch(/[–—]/);
    expect(plainReason("domain not verified")).not.toMatch(/[–—]/);
  });

  it("embeds fonts, so no font is fetched", () => {
    expect(html.match(/@font-face/g)).toHaveLength(3);
    expect(html).toContain("src:url(data:font/woff2;base64,");
  });
});

describe("share card and footer", () => {
  it("embeds the landscape card as a data image when given one", () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const html = render(makeReport(), png);
    expect(html).toContain(`src="data:image/png;base64,${png.toString("base64")}"`);
    expect(sectionOf(html, "share")).toContain("launchscore-card.png");
  });

  it("leaves the section out, without failing, when there is no card", () => {
    const html = render(makeReport());
    expect(html).not.toContain('<section id="share"');
    expect(html).not.toContain("<img");
  });

  it("shows when the scan ran (UTC), the version, and the methodology link placeholder", () => {
    const html = render(makeReport({ scannedAt: "2026-10-01T19:27:51.000Z" }));
    const footer = /<footer>[\s\S]*<\/footer>/.exec(html)![0];
    expect(footer).toContain("Scanned 1 Oct 2026, 19:27 UTC");
    expect(footer).toContain("launchscore 9.9.9");
    expect(footer).toContain(`href="${METHODOLOGY_URL}"`);
    expect(footer).toContain('rel="noopener noreferrer"');
  });
});
