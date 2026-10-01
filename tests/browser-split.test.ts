import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// The "unit" CI job runs without a browser installed. A test that starts Chromium, directly or through a
// scan, a page context, the share cards or Lighthouse, must be named *.browser.test.ts so that job skips it.
const testsDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );

const testFiles = walk(testsDir).filter((f) => f.endsWith(".test.ts"));
const isBrowserFile = (f: string): boolean => f.endsWith(".browser.test.ts");

const LAUNCHES_A_BROWSER = [
  /import\s*\{[^}]*\b(?:runScan|buildContext|renderCards|renderCardImages|scanAndWrite|runLighthouse)\b[^}]*\}\s*from/,
  /from\s*["'](?:playwright|playwright-core|@axe-core\/playwright|lighthouse)["']/,
];

describe("browser tests are kept apart from unit tests", () => {
  it("finds the test files", () => {
    expect(testFiles.length).toBeGreaterThan(20);
    expect(testFiles.some(isBrowserFile)).toBe(true);
  });

  it.each(testFiles.filter((f) => !isBrowserFile(f) && !f.endsWith("browser-split.test.ts")).map((f) => [path.relative(testsDir, f), f]))(
    "%s does not start a browser",
    (_name, file) => {
      const source = readFileSync(file, "utf8");
      for (const pattern of LAUNCHES_A_BROWSER) expect(source).not.toMatch(pattern);
    },
  );

  it("every *.browser.test.ts file really does need a browser (so the unit job is not smaller than it should be)", () => {
    for (const file of testFiles.filter(isBrowserFile)) {
      const source = readFileSync(file, "utf8");
      expect(LAUNCHES_A_BROWSER.some((p) => p.test(source)), path.relative(testsDir, file)).toBe(true);
    }
  });
});
