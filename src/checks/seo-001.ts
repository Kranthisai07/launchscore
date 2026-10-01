import { getMetaContent, getTitle } from "../html.js";
import type { Check, Finding, Severity } from "../types.js";

const finding = (severity: Severity, title: string, why: string, evidence: string, fix: string): Finding => ({
  checkId: "SEO-001",
  severity,
  title,
  why,
  evidence,
  fix,
});

export const seo001: Check = {
  id: "SEO-001",
  title: "Page title and description",
  category: "seo",
  mode: "passive",
  async run(ctx) {
    const title = getTitle(ctx.html);
    const description = getMetaContent(ctx.html, "description");
    const findings: Finding[] = [];

    if (title === "") {
      findings.push(
        finding(
          "high",
          "Your page has no title",
          "Google and browser tabs have nothing to show, so people are far less likely to find or click your site.",
          "No <title> found on the page",
          "Add a short, clear title (10 to 70 characters) describing what the page is.",
        ),
      );
    } else if (title.length < 10 || title.length > 70) {
      findings.push(
        finding(
          "low",
          title.length < 10 ? "Your page title is too short" : "Your page title is too long",
          "Google may cut it off or ignore it, which makes your search result less appealing.",
          `Title is ${title.length} characters: "${title.slice(0, 80)}"`,
          "Rewrite the title so it is between 10 and 70 characters.",
        ),
      );
    }

    if (description === "") {
      findings.push(
        finding(
          "medium",
          "Your page has no description for search results",
          "Google will pick random text from your page to show under your title, which is usually unappealing.",
          "No meta description found on the page",
          "Add a meta description of 50 to 160 characters that sells what the page offers.",
        ),
      );
    } else if (description.length < 50 || description.length > 160) {
      findings.push(
        finding(
          "low",
          description.length < 50 ? "Your page description is too short" : "Your page description is too long",
          "Google may ignore it or cut it off in search results.",
          `Description is ${description.length} characters`,
          "Rewrite the description so it is between 50 and 160 characters.",
        ),
      );
    }

    return findings;
  },
};
