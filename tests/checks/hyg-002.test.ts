import { describe, expect, it } from "vitest";
import { hyg002 } from "../../src/checks/hyg-002.js";
import { makeContext, page } from "../helpers/context.js";

const run = (body: string) => hyg002.run(makeContext({ html: page("", body) }));

describe("HYG-002 finds a terms link", () => {
  it.each([
    ["Terms", '<a href="/x">Terms</a>'],
    ["Terms of service", '<a href="/x">Terms of Service</a>'],
    ["Terms and conditions", '<a href="/x">Terms &amp; Conditions</a>'],
    ["Terms of use", '<a href="/x">Terms of use</a>'],
    ["TOS in the text", '<a href="/x">ToS</a>'],
    ["/terms", '<a href="/terms">Legal</a>'],
    ["/terms.html", '<a href="/terms.html">Legal</a>'],
    ["/terms-of-service", '<a href="/terms-of-service">Legal</a>'],
    ["/terms-and-conditions/", '<a href="/terms-and-conditions/">Legal</a>'],
    ["/legal/terms", '<a href="/legal/terms">Legal</a>'],
    ["/tos", '<a href="/tos">Legal</a>'],
    ["/tos.html", '<a href="/tos.html">Legal</a>'],
    ["German AGB", '<a href="/a">AGB</a>'],
    ["German terms", '<a href="/a">Nutzungsbedingungen</a>'],
    ["French", '<a href="/a">Conditions générales</a>'],
    ["Spanish", '<a href="/a">Términos y condiciones</a>'],
    ["nested tags", '<a href="/x"><span>Terms</span></a>'],
  ])("%s", async (_name, body) => {
    expect(await run(body)).toEqual([]);
  });
});

describe("HYG-002 reports a missing terms link as low", () => {
  it("with no terms link at all", async () => {
    const findings = await run('<a href="/privacy">Privacy</a><a href="/about">About</a>');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "HYG-002", severity: "low", title: "Your site has no terms of service link" });
    expect(findings[0].fix).toMatch(/footer/);
  });

  it.each([
    ["the word inside another word", '<a href="/a">Determs</a><a href="/b">Postos</a>'],
    ["tos inside a longer path word", '<a href="/photos/">Photos</a><a href="/protos/">Protos</a>'],
    ["terms as a query value only", '<a href="/page?section=terms">Info</a>'],
    ["plain text", "<p>Terms of service apply.</p>"],
    ["a button", "<button>Terms</button>"],
    ["a link in a comment", '<!-- <a href="/terms">Terms</a> -->'],
    ["a link in a script string", '<script>"<a href=\'/terms\'>Terms</a>"</script>'],
  ])("for %s", async (_name, body) => {
    expect(await run(body)).toHaveLength(1);
  });
});
