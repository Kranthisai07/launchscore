import { describe, expect, it } from "vitest";
import { assertVerified, isVerified, NotVerifiedError } from "../src/verify.js";

describe("verify stub", () => {
  it.each(["http://localhost", "http://localhost:3000/path", "http://127.0.0.1:8080/"])(
    "%s is verified",
    async (url) => {
      expect(await isVerified(url)).toBe(true);
      await expect(assertVerified(url)).resolves.toBeUndefined();
    },
  );

  it.each(["https://example.com", "http://127.0.0.1.evil.com", "http://evil.com/localhost", "not a url"])(
    "%s is not verified",
    async (url) => {
      expect(await isVerified(url)).toBe(false);
      await expect(assertVerified(url)).rejects.toBeInstanceOf(NotVerifiedError);
    },
  );
});
