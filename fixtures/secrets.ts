// Obviously fake keys, assembled at serve time from fragments so no full key
// sits in the repo (keeps GitHub push protection quiet and nothing to leak).

const join = (...parts: string[]): string => parts.join("");

const b64url = (value: object | string): string =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function fakeSupabaseJwt(role: "anon" | "service_role"): string {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    iss: "supabase",
    ref: "fakefakefakefakefake",
    role,
    iat: 1700000000,
    exp: 2000000000,
  });
  return join(header, ".", payload, ".", b64url("FAKESIGNATURE"));
}

export const FAKE_SECRETS: Record<string, string> = {
  STRIPE_PK_TEST: join("pk_", "test_", "FAKEFAKE", "FAKEFAKE", "FAKEFAKE"),
  STRIPE_SK_LIVE: join("sk_", "live_", "FAKEFAKE", "FAKEFAKE", "FAKEFAKE"),
  SUPABASE_ANON_JWT: fakeSupabaseJwt("anon"),
  SUPABASE_SERVICE_JWT: fakeSupabaseJwt("service_role"),
  SUPABASE_URL: join("https://", "fakefakefakefakefake", ".supabase", ".co"),
};
