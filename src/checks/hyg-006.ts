import { randomBytes } from "node:crypto";
import type { PageContext } from "../context.js";
import type { Check } from "../types.js";

export const MAX_LINKS = 50;
export const TIME_BUDGET_MS = 30_000;
export const SOFT_404_REASON = "broken links can't be checked: site returns the home page for every address";

type Verdict = "ok" | "broken" | "unknown";

// HEAD first (cheap). Some servers answer HEAD wrongly, so anything but success is confirmed with GET.
async function judge(ctx: PageContext, url: string): Promise<Verdict> {
  const head = await ctx.fetch(url, { method: "HEAD" });
  if (head && head.status >= 200 && head.status < 400) return "ok";
  const get = await ctx.fetch(url);
  if (get === null) return "unknown"; // a failed request is not proof of a broken link
  if (get.status === 404 || get.status === 410) return "broken";
  return get.status < 400 ? "ok" : "unknown";
}

const withoutHash = (url: string): string => url.split("#")[0];

export const hyg006: Check = {
  id: "HYG-006",
  title: "Broken internal links",
  category: "hygiene",
  mode: "passive",
  async run(ctx) {
    const links = ctx.links.filter((l) => withoutHash(l) !== withoutHash(ctx.finalUrl));
    const checked = links.slice(0, MAX_LINKS);
    if (links.length > MAX_LINKS) {
      ctx.notTested.push({
        checkId: "HYG-006",
        title: "Broken internal links",
        reason: `${links.length - MAX_LINKS} links not checked (limit ${MAX_LINKS})`,
      });
    }
    if (checked.length === 0) return [];

    // One request to an address that cannot exist. If that comes back as a normal page, the site never says
    // "not found", so a broken link looks exactly like a working one and we must not claim they are fine.
    const probe = await ctx.fetch(new URL(`/launchscore-check-${randomBytes(4).toString("hex")}`, ctx.finalUrl).href);
    if (probe !== null && probe.status === 200) {
      ctx.notTested.push({ checkId: "HYG-006", title: "Broken internal links", reason: SOFT_404_REASON });
      return [];
    }

    const deadline = Date.now() + TIME_BUDGET_MS;
    let skipped = 0;
    const broken: string[] = [];
    await Promise.all(
      checked.map(async (url) => {
        if (Date.now() > deadline) {
          skipped++;
          return;
        }
        if ((await judge(ctx, url)) === "broken") broken.push(url);
      }),
    );
    if (skipped > 0) {
      ctx.notTested.push({
        checkId: "HYG-006",
        title: "Broken internal links",
        reason: `${skipped} links not checked (time limit)`,
      });
    }
    if (broken.length === 0) return [];

    // Paths only: a query string can carry tokens.
    const paths = [...new Set(broken.map((url) => new URL(url).pathname))];
    return [
      {
        checkId: "HYG-006",
        severity: "medium",
        title: "Some links on your page lead nowhere (broken links)",
        why: "Visitors hit a dead end, and search engines may decide the site is neglected.",
        evidence: `${broken.length} broken link${broken.length === 1 ? "" : "s"}, first: ${paths.slice(0, 3).join(", ")}`,
        fix: "Fix or remove those links, or create the pages they point to.",
      },
    ];
  },
};
