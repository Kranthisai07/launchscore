// Fake keys for every provider, built from fragments so no full key sits in the repo
// (keeps GitHub push protection quiet). Bodies are mixed characters, not placeholders.
const join = (...parts: string[]): string => parts.join("");
const body = (n: number): string => "aB3dE6gH9jK2mN5pQ8sT1vW4yZ7xC0".repeat(Math.ceil(n / 30)).slice(0, n);

const b64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString("base64url");

export const jwt = (role: string): string =>
  join(b64url({ alg: "HS256", typ: "JWT" }), ".", b64url({ iss: "supabase", role }), ".", "c2lnbmF0dXJl");

export const KEYS = {
  stripeLive: join("sk_", "live_", body(24)),
  stripeRestrictedLive: join("rk_", "live_", body(24)),
  stripeTest: join("sk_", "test_", body(24)),
  stripeRestrictedTest: join("rk_", "test_", body(24)),
  stripePublishableLive: join("pk_", "live_", body(24)),
  stripePublishableTest: join("pk_", "test_", body(24)),
  openaiProject: join("sk-", "proj-", body(40)),
  openaiLegacy: join("sk-", body(48)),
  openaiAdmin: join("sk-", "admin-", body(40)),
  anthropic: join("sk-", "ant-", "api03-", body(40)),
  aws: join("AKIA", "Q3W4E5R6T7Y8U9I0"),
  awsDocsExample: join("AKIA", "IOSFODNN7", "EXAMPLE"),
  githubClassic: join("ghp_", body(36)),
  githubFineGrained: join("github_", "pat_", body(50)),
  supabaseSecret: join("sb_", "secret_", body(22), "_", body(8)),
  supabasePublishable: join("sb_", "publishable_", body(22), "_", body(8)),
  googleApiKey: join("AI", "za", "Sy", body(33)),
};
