import type { FetchResult } from "../fetcher.js";
import type { Check, Finding } from "../types.js";

type State = "present" | "missing" | "unknown";

const looksLikeHtml = (res: FetchResult): boolean =>
  (res.headers["content-type"] ?? "").toLowerCase().includes("text/html") || /^\s*<(!doctype|html|head|body)\b/i.test(res.body);

// A 200 that is really the site's home page (common for apps that answer every path) counts as missing.
function stateOf(res: FetchResult | null, valid: (res: FetchResult) => boolean): State {
  if (res === null) return "unknown";
  if (res.status === 404 || res.status === 410) return "missing";
  if (res.status === 200) return valid(res) ? "present" : "missing";
  return "unknown"; // blocked, error, or a redirect away: not proof of anything
}

interface Group {
  agents: string[];
  rules: { type: "allow" | "disallow"; value: string }[];
}

function parseRobots(text: string): { groups: Group[]; sitemaps: string[] } {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | undefined;
  let collectingAgents = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!current || !collectingAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      collectingAgents = true;
    } else if (field === "allow" || field === "disallow") {
      collectingAgents = false;
      current?.rules.push({ type: field, value });
    } else if (field === "sitemap" && value !== "") {
      sitemaps.push(value);
    }
  }
  return { groups, sitemaps };
}

const finding = (severity: Finding["severity"], title: string, why: string, evidence: string, fix: string): Finding => ({
  checkId: "SEO-003",
  severity,
  title,
  why,
  evidence,
  fix,
});

export const seo003: Check = {
  id: "SEO-003",
  title: "robots.txt and sitemap.xml",
  category: "seo",
  mode: "passive",
  async run(ctx) {
    const robotsUrl = new URL("/robots.txt", ctx.finalUrl).href;
    const sitemapUrl = new URL("/sitemap.xml", ctx.finalUrl).href;
    const [robots, sitemap] = await Promise.all([ctx.fetch(robotsUrl), ctx.fetch(sitemapUrl)]);

    const robotsState = stateOf(robots, (r) => !looksLikeHtml(r));
    const sitemapState = stateOf(sitemap, (r) => /<(urlset|sitemapindex)\b/i.test(r.body));
    const findings: Finding[] = [];

    let declared = false;
    if (robotsState === "present" && robots) {
      const parsed = parseRobots(robots.body);
      declared = parsed.sitemaps.length > 0;
      const everyone = parsed.groups.filter((g) => g.agents.includes("*")).flatMap((g) => g.rules);
      const blocksAll = everyone.some((r) => r.type === "disallow" && r.value === "/");
      const allowsRoot = everyone.some((r) => r.type === "allow" && r.value === "/"); // wins a tie
      if (blocksAll && !allowsRoot) {
        findings.push(
          finding(
            "high",
            "Your site tells Google not to visit any of your pages (robots.txt blocks everything)",
            "Your site will not show up in Google search results at all.",
            "robots.txt contains: User-agent: * and Disallow: /",
            "Remove the Disallow: / line from robots.txt (or replace it with Allow: /), then redeploy.",
          ),
        );
      }
    }

    if (robotsState === "missing") {
      findings.push(
        finding(
          "low",
          "Your site has no robots.txt (a file that tells search engines what they may visit)",
          "Search engines fall back to guessing, and you cannot point them to your sitemap.",
          `No robots.txt found at ${robotsUrl}`,
          "Add a robots.txt file at the root of your site, for example: User-agent: * and Allow: /",
        ),
      );
    }

    // Only say a sitemap is missing when we know robots.txt does not declare one elsewhere.
    if (sitemapState === "missing" && robotsState !== "unknown" && !declared) {
      findings.push(
        finding(
          "low",
          "Your site has no sitemap.xml (a list of your pages for search engines)",
          "Search engines may take longer to find all of your pages.",
          `No sitemap.xml found at ${sitemapUrl}`,
          "Generate a sitemap.xml for your site and, ideally, add a Sitemap: line to robots.txt.",
        ),
      );
    }

    return findings;
  },
};
