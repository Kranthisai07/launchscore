import { describe, expect, it } from "vitest";
import { redact } from "../src/redact.js";

describe("redact", () => {
  it("keeps the first 4 and last 4 characters", () => {
    expect(redact("abcdefghijklmnopqrstuvwx")).toBe("abcd…uvwx");
  });

  it("redacts exactly 12 characters to first 4 + last 4", () => {
    expect(redact("abcdefghijkl")).toBe("abcd…ijkl");
  });

  it.each(["", "short", "elevenchars"])("fully hides %j (under 12 characters)", (value) => {
    expect(redact(value)).toBe("[redacted]");
  });

  it("never returns the middle of a long value", () => {
    expect(redact("TOPSECRET-THISMIDDLEMUSTNOTLEAK-1234")).not.toContain("MIDDLE");
  });
});
