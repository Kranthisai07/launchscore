import { describe, expect, it } from "vitest";
import { normalizeUrl } from "../src/scan.js";

describe("normalizeUrl", () => {
  it.each([
    ["https://mysite.com", "https://mysite.com/"],
    ["mysite.com", "https://mysite.com/"],
    ["localhost:3000", "http://localhost:3000/"],
    ["127.0.0.1:8080/x", "http://127.0.0.1:8080/x"],
    ["http://mysite.com/a?b=1", "http://mysite.com/a?b=1"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  it("rejects non-web schemes and nonsense", () => {
    expect(() => normalizeUrl("ftp://x.com")).toThrow(/http and https/);
    expect(() => normalizeUrl("")).toThrow(/web address/);
  });
});
