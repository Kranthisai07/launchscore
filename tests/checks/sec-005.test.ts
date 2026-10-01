import { describe, expect, it } from "vitest";
import { sec005 } from "../../src/checks/sec-005.js";
import { makeContext, page } from "../helpers/context.js";

describe("SEC-005 detects Supabase", () => {
  it("finds a project URL in a script", async () => {
    const body = 'createClient("https://abcdefghij.supabase.co", key)';
    const ctx = makeContext({ scripts: [{ url: "https://shop.test/app.js", body }] });
    expect(await sec005.detect!(ctx)).toEqual([
      { checkId: "SEC-005", stack: "supabase", url: "abcdefghij.supabase.co", note: expect.stringContaining("Supabase") },
    ]);
  });

  it.each([
    ["raw HTML", { rawHtml: page("", '<p data-url="https://abcdefghij.supabase.co/x">hi</p>') }],
    ["rendered HTML", { html: page("", "<script>var u='https://abcdefghij.supabase.co'</script>") }],
  ])("finds a project URL in %s", async (_name, overrides) => {
    const found = await sec005.detect!(makeContext(overrides));
    expect(found.map((d) => d.url)).toEqual(["abcdefghij.supabase.co"]);
  });

  it("reports one detection per unique host, case-insensitively", async () => {
    const ctx = makeContext({
      scripts: [
        { url: "https://shop.test/a.js", body: "https://AbcDef.supabase.co https://abcdef.supabase.co/rest/v1" },
        { url: "https://shop.test/b.js", body: "https://other.supabase.co" },
      ],
      rawHtml: "https://abcdef.supabase.co",
    });
    expect((await sec005.detect!(ctx)).map((d) => d.url)).toEqual(["abcdef.supabase.co", "other.supabase.co"]);
  });

  it.each([
    "https://supabase.com/docs",
    "https://supabase.co",
    "https://docs.supabase.co/guide",
    "https://www.supabase.co",
    "see supabase.co for details",
    "https://notsupabase.co/x",
    "https://abc.supabase.com",
  ])("ignores %s", async (text) => {
    const ctx = makeContext({ rawHtml: text, scripts: [{ url: "https://shop.test/a.js", body: text }] });
    expect(await sec005.detect!(ctx)).toEqual([]);
  });

  it("is a detection, never a finding", async () => {
    expect(await sec005.run(makeContext({ rawHtml: "https://abcdefghij.supabase.co" }))).toEqual([]);
  });

  it("reports nothing when Supabase is not used", async () => {
    expect(await sec005.detect!(makeContext())).toEqual([]);
  });
});
