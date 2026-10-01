import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { summarizeAxe, AXE_TAGS, type AxeViolation } from "../../src/axe.js";
import { a11y001 } from "../../src/checks/a11y-001.js";
import { makeContext } from "../helpers/context.js";

const recorded = (name: string) =>
  JSON.parse(readFileSync(new URL(`../recorded/axe-${name}.json`, import.meta.url), "utf8"));

const violation = (overrides: Partial<AxeViolation> = {}): AxeViolation => ({
  id: "some-rule",
  impact: "serious",
  help: "Elements must do the thing",
  helpUrl: "https://dequeuniversity.com/rules/axe/4.13/some-rule",
  nodes: 2,
  firstTarget: "div.card > a",
  ...overrides,
});

const run = (violations: AxeViolation[]) => a11y001.run(makeContext({ axe: { violations } }));

describe("summarizeAxe (recorded output from the fixtures)", () => {
  it("keeps only ids, impact, help text, a count and the first selector", () => {
    const outcome = summarizeAxe(recorded("bad"));
    expect(outcome).toEqual({
      violations: [
        expect.objectContaining({ id: "color-contrast", impact: "serious", nodes: 1, firstTarget: ".muted" }),
        expect.objectContaining({ id: "document-title", impact: "serious", firstTarget: "html" }),
        expect.objectContaining({ id: "image-alt", impact: "critical", firstTarget: "img" }),
        expect.objectContaining({ id: "label", impact: "critical", firstTarget: "input" }),
      ],
    });
    expect(JSON.stringify(outcome)).not.toContain("<img"); // no HTML snippets are kept
  });

  it("is empty for the good fixture", () => {
    expect(summarizeAxe(recorded("good"))).toEqual({ violations: [] });
  });

  it("never reads needs-review (incomplete) results", () => {
    const raw = { ...recorded("good"), incomplete: [{ id: "color-contrast", nodes: [{}] }] };
    expect(summarizeAxe(raw)).toEqual({ violations: [] });
  });

  it("joins selectors that cross iframes and shadow roots, and tolerates a null impact", () => {
    const raw = {
      violations: [
        { id: "x", impact: null, help: "h", helpUrl: "u", nodes: [{ target: [["#host", "button.go"]] }, { target: ["p"] }] },
      ],
    };
    expect(summarizeAxe(raw)).toEqual({
      violations: [{ id: "x", impact: null, help: "h", helpUrl: "u", nodes: 2, firstTarget: "#host button.go" }],
    });
  });

  it("uses WCAG A and AA tags only", () => {
    expect(AXE_TAGS).toEqual(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  });
});

describe("A11Y-001 on recorded fixture output", () => {
  it("bad: image-alt and label are high, color-contrast is medium, and document-title is left to SEO-001", async () => {
    const findings = await a11y001.run(makeContext({ axe: summarizeAxe(recorded("bad")) }));
    expect(findings.map((f) => [f.severity, f.title])).toEqual([
      ["medium", "Some text is too faint to read easily (low color contrast)"],
      ["high", "Some images have no text description (alt text)"],
      ["high", "Some form fields have no label"],
    ]);
    expect(findings.map((f) => f.evidence)).toEqual(["1 element, first: .muted", "1 element, first: img", "1 element, first: input"]);
    expect(findings.every((f) => f.checkId === "A11Y-001")).toBe(true);
  });

  it("good: nothing", async () => {
    expect(await a11y001.run(makeContext({ axe: summarizeAxe(recorded("good")) }))).toEqual([]);
  });
});

describe("A11Y-001 mapping", () => {
  it.each([
    ["critical", "high"],
    ["serious", "medium"],
    ["moderate", "low"],
    ["minor", "low"],
    [null, "low"],
    ["something-new", "low"],
  ])("axe impact %s becomes %s", async (impact, severity) => {
    const [finding] = await run([violation({ impact })]);
    expect(finding.severity).toBe(severity);
  });

  it("reports one finding per rule id", async () => {
    const findings = await run([violation({ id: "a" }), violation({ id: "b" }), violation({ id: "c", nodes: 40 })]);
    expect(findings).toHaveLength(3);
  });

  it("writes evidence as a count plus the first selector, singular or plural", async () => {
    const [one, many] = await run([violation({ nodes: 1, firstTarget: "img.hero" }), violation({ nodes: 7, firstTarget: "#nav a" })]);
    expect(one.evidence).toBe("1 element, first: img.hero");
    expect(many.evidence).toBe("7 elements, first: #nav a");
  });

  it.each([
    ["image-alt", "alt text"],
    ["color-contrast", "color contrast"],
    ["label", "no label"],
    ["link-name", "links"],
    ["button-name", "buttons"],
    ["html-has-lang", "language"],
  ])("gives %s a plain-English title, reason and fix", async (id, word) => {
    const [finding] = await run([violation({ id, help: "Technical axe wording" })]);
    expect(finding.title).toContain(word);
    expect(finding.title).not.toContain("Technical axe wording");
    expect(finding.why.length).toBeGreaterThan(20);
    expect(finding.fix.length).toBeGreaterThan(15);
  });

  it("falls back to axe's help text and help page for other rules", async () => {
    const [finding] = await run([violation()]);
    expect(finding.title).toBe("Accessibility issue: Elements must do the thing");
    expect(finding.fix).toContain("https://dequeuniversity.com/rules/axe/4.13/some-rule");
  });

  it("skips document-title (SEO-001 already reports it) and rules with no elements", async () => {
    expect(await run([violation({ id: "document-title" }), violation({ id: "empty", nodes: 0 })])).toEqual([]);
  });

  it("is clean when axe found nothing", async () => {
    expect(await run([])).toEqual([]);
  });

  it("fails loudly when axe itself failed, so the category is not treated as clean", async () => {
    const ctx = makeContext({ axe: { error: "axe timed out" } });
    await expect(a11y001.run(ctx)).rejects.toThrow("the accessibility scan failed: axe timed out");
  });
});
