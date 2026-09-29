import { describe, it, expect } from "vitest";
import { checkMessage } from "../src/message.js";

describe("checkMessage", () => {
  it("includes the url and ok", () => {
    const result = checkMessage("https://example.com");
    expect(result).toBe("https://example.com\nok");
  });
});
