import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "../fixtures/server.js";
import { FAKE_SECRETS } from "../fixtures/secrets.js";
import { buildReport } from "../src/report/json.js";
import { redact } from "../src/redact.js";
import { runScan } from "../src/runner.js";

let bad: FixtureServer;
let json: string;

beforeAll(async () => {
  bad = await startFixtureServer("bad");
  json = JSON.stringify(buildReport(await runScan(bad.url + "/", { skipPerformance: true })), null, 2);
});

afterAll(async () => {
  await bad.close();
});

describe("full scan of the bad fixture", () => {
  it("never puts a full secret in the report", () => {
    expect(json).not.toContain(FAKE_SECRETS.STRIPE_SK_LIVE);
    expect(json).not.toContain(FAKE_SECRETS.SUPABASE_SERVICE_JWT);
    // not even the unredacted middle of either secret
    expect(json).not.toContain(FAKE_SECRETS.STRIPE_SK_LIVE.slice(6, 20));
    expect(json).not.toContain(FAKE_SECRETS.SUPABASE_SERVICE_JWT.slice(10, 40));
  });

  it("contains the redacted forms instead", () => {
    expect(json).toContain(redact(FAKE_SECRETS.STRIPE_SK_LIVE));
    expect(json).toContain(redact(FAKE_SECRETS.SUPABASE_SERVICE_JWT));
  });

  it("does not mention the decoy publishable keys", () => {
    expect(json).not.toContain("pk_test_");
    expect(json).not.toContain(FAKE_SECRETS.SUPABASE_ANON_JWT); // anon JWT is never flagged
  });
});
