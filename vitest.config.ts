import { configDefaults, defineConfig } from "vitest/config";

// Tests that start Chromium (directly, or through a scan, a page context or the share cards) are named
// *.browser.test.ts. LAUNCHSCORE_SKIP_BROWSER_TESTS=1 leaves them out, so the rest can run on a machine
// with no browser installed (the "unit" CI job does exactly that).
const skipBrowser = process.env.LAUNCHSCORE_SKIP_BROWSER_TESTS === "1";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: [...configDefaults.exclude, ...(skipBrowser ? ["tests/**/*.browser.test.ts"] : [])],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
