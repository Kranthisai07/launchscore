import { describe, expect, it } from "vitest";
import { hyg001 } from "../../src/checks/hyg-001.js";
import { makeContext, page } from "../helpers/context.js";

const run = (body: string, overrides: Parameters<typeof makeContext>[0] = {}) =>
  hyg001.run(makeContext({ html: page("", body), ...overrides }));

describe("HYG-001 finds a privacy link", () => {
  it.each([
    ["link text", '<a href="/legal">Privacy policy</a>'],
    ["link text, any case", '<a href="/x">PRIVACY</a>'],
    ["an address path", '<a href="/privacy">Legal</a>'],
    ["an address path with a file name", '<a href="/privacy-policy.html">Read this</a>'],
    ["a nested path", '<a href="/legal/privacy/">Legal</a>'],
    ["German", '<a href="/d">Datenschutz</a>'],
    ["German path", '<a href="/datenschutzerklaerung">Info</a>'],
    ["French", "<a href=\"/c\">Politique de confidentialité</a>"],
    ["French without the accent", '<a href="/confidentialite">Info</a>'],
    ["Spanish", '<a href="/p">Política de privacidad</a>'],
    ["an external policy", '<a href="https://app.termly.io/document/privacy-policy/abc">Our policy</a>'],
    ["text inside nested tags", '<a href="/x"><span>Privacy</span> <b>Policy</b></a>'],
  ])("%s", async (_name, body) => {
    expect(await run(body)).toEqual([]);
  });
});

describe("HYG-001 reports a missing privacy link", () => {
  it("as medium when the page collects nothing", async () => {
    const findings = await run('<a href="/about">About</a><p>Hello</p>');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "HYG-001", severity: "medium" });
    expect(findings[0].title).toBe("Your site has no privacy policy link");
  });

  it.each([
    ["the domain name alone", '<a href="https://privacy.example.org/">Home</a>'],
    ["a word that only contains letters of the word", "<a href=\"/a\">Pri vacy</a>"],
    ["a button instead of a link", "<button>Privacy</button>"],
    ["text outside a link", "<p>Read our privacy policy</p>"],
    ["a link in a script string", '<script>var a = "<a href=\'/privacy\'>Privacy</a>"</script>'],
    ["a link in a comment", '<!-- <a href="/privacy">Privacy</a> -->'],
    ["a link in noscript", '<noscript><a href="/privacy">Privacy</a></noscript>'],
  ])("when there is only %s", async (_name, body) => {
    expect(await run(body)).toHaveLength(1);
  });

  describe("high when the page collects personal details", () => {
    it("a password field", async () => {
      const [f] = await run('<input type="password" name="pw">');
      expect(f.severity).toBe("high");
      expect(f.evidence).toContain("password field");
    });

    it("an email field inside a form", async () => {
      const [f] = await run('<form><input type="email" name="e"></form>');
      expect(f.severity).toBe("high");
      expect(f.evidence).toContain("email address");
    });

    it.each(['<input name="user_email">', '<input id="email">', '<input autocomplete="email">'])("an input named like %s inside a form", async (input) => {
      expect((await run(`<form>${input}</form>`))[0].severity).toBe("high");
    });

    it("Supabase detected in a script", async () => {
      const ctx = { scripts: [{ url: "https://shop.test/a.js", body: "https://abcdefghij.supabase.co" }] };
      const [f] = await run("<p>Hi</p>", ctx);
      expect(f.severity).toBe("high");
      expect(f.evidence).toContain("Supabase");
    });

    it.each([
      ["Auth0", "https://tenant.auth0.com/authorize"],
      ["Clerk", "https://clerk.accounts.dev/v1/client"],
      ["Firebase sign-in", "https://identitytoolkit.googleapis.com/v1/accounts"],
      ["Amazon Cognito", "https://cognito-idp.us-east-1.amazonaws.com/"],
      ["Okta", "https://dev-123.okta.com/oauth2"],
    ])("%s detected", async (name, text) => {
      const [f] = await run("<p>Hi</p>", { rawHtml: text });
      expect(f.severity).toBe("high");
      expect(f.evidence).toContain(name);
    });

    it("explains the risk in plain English", async () => {
      const [f] = await run('<input type="password">');
      expect(f.why).toMatch(/personal details/);
      expect(f.fix).toMatch(/footer/);
    });
  });

  it("stays medium for an email input outside any form (no form, no collection claim)", async () => {
    expect((await run('<input type="email">'))[0].severity).toBe("medium");
  });

  it("stays medium for a form that does not ask for an email or password", async () => {
    expect((await run('<form><input type="text" name="q"></form>'))[0].severity).toBe("medium");
  });

  it("does not treat a hidden input in a script or comment as collection", async () => {
    expect((await run('<!-- <input type="password"> --><script>"<input type=password>"</script>'))[0].severity).toBe("medium");
  });

  it("is not fooled by an unrelated 'supabase' word", async () => {
    expect((await run("<p>supabase.com</p>", { rawHtml: "https://supabase.com/docs" }))[0].severity).toBe("medium");
  });
});
