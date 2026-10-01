import { findSupabaseHosts } from "../stack.js";
import type { Check, Detection } from "../types.js";

// Not a problem, so it is a detection: it is reported but never scored.
export const sec005: Check = {
  id: "SEC-005",
  title: "Supabase detected",
  category: "security",
  mode: "passive",
  async run() {
    return [];
  },
  async detect(ctx) {
    return findSupabaseHosts(ctx).map(
      (host): Detection => ({
        checkId: "SEC-005",
        stack: "supabase",
        url: host,
        note: "This site uses Supabase as its database. A test of who can read your data becomes available once you verify your domain.",
      }),
    );
  },
};
