import { describe, expect, it } from "vitest";
import { skipSummary, SKIP_REASON } from "../src/context.js";
import { plainReason } from "../src/report/html.js";

const skipped = (...reasons: [string, number][]) =>
  reasons.flatMap(([reason, n]) => Array.from({ length: n }, (_, i) => ({ url: `https://x.test/${reason}/${i}.js`, reason })));

describe("skipSummary", () => {
  it("counts scripts per reason, biggest group first", () => {
    expect(skipSummary(skipped([SKIP_REASON.unreadable, 1], [SKIP_REASON.fileLimit, 59]))).toBe("59 over the file limit, 1 unreadable");
  });

  it("breaks ties alphabetically", () => {
    expect(skipSummary(skipped([SKIP_REASON.unreadable, 2], [SKIP_REASON.tooLarge, 2], [SKIP_REASON.sizeLimit, 2]))).toBe(
      "2 over the size limit, 2 too large, 2 unreadable",
    );
  });

  it("handles a single reason and an empty list", () => {
    expect(skipSummary(skipped([SKIP_REASON.sizeLimit, 4]))).toBe("4 over the size limit");
    expect(skipSummary([])).toBe("");
  });
});

describe("the report's plain sentences for skipped scripts", () => {
  const plain = (summary: string) => plainReason(`scripts not scanned: ${summary}`);

  it("gives each reason its own sentence", () => {
    const text = plain("59 over the file limit, 1 unreadable");
    expect(text).toContain("59 script files came after the first 500 we read, so we did not look inside them.");
    expect(text).toContain("1 script file could not be read (the site's server did not hand over its contents), so we could not look inside it.");
    expect(text).toContain("Secret keys could be hiding in files we did not read.");
  });

  it.each([
    ["4 over the size limit", "4 script files would have taken us past 25 MB of code in total, so we did not read them."],
    ["2 too large", "2 script files were bigger than 5 MB, so we did not read them."],
    ["1 too large", "1 script file was bigger than 5 MB, so we did not read it."],
    ["1 over the file limit", "1 script file came after the first 500 we read, so we did not look inside it."],
  ])("%s", (summary, sentence) => {
    expect(plain(summary)).toContain(sentence);
  });

  it("falls back gracefully for a reason it does not know", () => {
    expect(plain("3 something new")).toContain("3 script files were skipped (something new).");
    expect(plain("odd")).toContain("Some script files were skipped (odd).");
  });

  it("never claims files were 'too big' when they were only over the count limit", () => {
    expect(plain("59 over the file limit")).not.toMatch(/too big|bigger/);
  });
});
