import { describe, expect, it } from "vitest";
import { sec001 } from "../../src/checks/sec-001.js";
import { redact } from "../../src/redact.js";
import { makeContext, page } from "../helpers/context.js";
import { jwt, KEYS } from "../helpers/keys.js";

const scan = (body: string, url = "https://shop.test/assets/app.js") =>
  sec001.run(makeContext({ scripts: [{ url, body }] }));

describe("SEC-001 flags secret keys", () => {
  it.each([
    ["Stripe live secret key", KEYS.stripeLive, "critical"],
    ["Stripe live restricted key", KEYS.stripeRestrictedLive, "critical"],
    ["Stripe test secret key", KEYS.stripeTest, "medium"],
    ["Stripe test restricted key", KEYS.stripeRestrictedTest, "medium"],
    ["OpenAI project key", KEYS.openaiProject, "critical"],
    ["OpenAI legacy key", KEYS.openaiLegacy, "critical"],
    ["OpenAI admin key", KEYS.openaiAdmin, "critical"],
    ["Anthropic key", KEYS.anthropic, "critical"],
    ["AWS access key ID", KEYS.aws, "high"],
    ["GitHub classic token", KEYS.githubClassic, "critical"],
    ["GitHub fine-grained token", KEYS.githubFineGrained, "critical"],
    ["Supabase secret key", KEYS.supabaseSecret, "critical"],
    ["Supabase service_role JWT", jwt("service_role"), "critical"],
  ])("%s", async (_name, key, severity) => {
    const findings = await scan(`var k = "${key}";`);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "SEC-001", severity });
    expect(findings[0].evidence).toContain(redact(key));
    expect(findings[0].evidence).not.toContain(key);
  });
});

describe("SEC-001 never flags public or look-alike values", () => {
  it.each([
    ["Stripe publishable live key", KEYS.stripePublishableLive],
    ["Stripe publishable test key", KEYS.stripePublishableTest],
    ["Supabase publishable key", KEYS.supabasePublishable],
    ["Supabase anon JWT", jwt("anon")],
    ["Supabase authenticated JWT", jwt("authenticated")],
    ["Google API key", KEYS.googleApiKey],
    ["AWS documentation example key", KEYS.awsDocsExample],
    ["Firebase config", 'apiKey:"' + KEYS.googleApiKey + '",authDomain:"x.firebaseapp.com",projectId:"x"'],
    ["placeholder Stripe key", "sk_" + "live_" + "x".repeat(24)],
    ["key prefix inside a longer word", "task_" + "live_" + KEYS.stripeLive.slice(8)],
    ["too-short Stripe key", "sk_" + "live_" + "abc123"],
    ["not a JWT", "eyJ.eyJ.x"],
    ["JWT with an unreadable payload", "eyJhbGciOiJIUzI1NiJ9.eyJ!!!notbase64!!!.c2ln"],
  ])("%s", async (_name, value) => {
    expect(await scan(`var k = "${value}";`)).toEqual([]);
  });
});

describe("SEC-001 reporting", () => {
  it("reports one finding per unique secret and names the file", async () => {
    const ctx = makeContext({
      scripts: [
        { url: "https://shop.test/a.js?token=abc#x", body: `x="${KEYS.stripeLive}";y="${KEYS.stripeLive}"` },
        { url: "https://shop.test/b.js", body: `x="${KEYS.stripeLive}"` },
        { url: "https://shop.test/c.js", body: `x="${KEYS.anthropic}"` },
      ],
    });
    const findings = await sec001.run(ctx);
    expect(findings).toHaveLength(2);
    expect(findings[0].evidence).toBe(`${redact(KEYS.stripeLive)} (in https://shop.test/a.js and 1 other place(s))`);
    expect(findings[1].evidence).toBe(`${redact(KEYS.anthropic)} (in https://shop.test/c.js)`);
  });

  it("finds secrets in inline scripts in the raw and the rendered HTML, once", async () => {
    const html = page("", `<script>window.k="${KEYS.githubClassic}"</script>`);
    const findings = await sec001.run(makeContext({ rawHtml: html, html }));
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toContain("inline script");
  });

  it("finds secrets that only appear after rendering", async () => {
    const findings = await sec001.run(
      makeContext({ rawHtml: page(""), html: page("", `<script>k="${KEYS.openaiProject}"</script>`) }),
    );
    expect(findings).toHaveLength(1);
  });

  it("ignores keys in plain page text and external script tags", async () => {
    const html = page("", `<p>${KEYS.stripeLive}</p><script src="/x.js" data-k="${KEYS.stripeLive}"></script>`);
    expect(await sec001.run(makeContext({ rawHtml: html, html }))).toEqual([]);
  });

  it("writes plain-English text and a fix that names the provider", async () => {
    const [finding] = await scan(`k="${KEYS.supabaseSecret}"`);
    expect(finding.title).toContain("Supabase admin key");
    expect(finding.fix).toContain("Supabase dashboard");
  });
});
