import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "../fixtures/server.js";
import { buildContext, type PageContext } from "../src/context.js";

let bad: FixtureServer;
let ctx: PageContext;

beforeAll(async () => {
  bad = await startFixtureServer("bad");
  ctx = await buildContext(bad.url + "/");
});

afterAll(async () => {
  await bad.close();
});

describe("captured scripts", () => {
  it("carry their response headers, lowercased", () => {
    const app = ctx.scripts.find((s) => s.url.endsWith("/app.js"))!;
    expect(app.headers?.["content-type"]).toContain("javascript");
  });
});

describe("ctx.fetch on a real page", () => {
  it("fetches from the page's own host", async () => {
    const map = await ctx.fetch(bad.url + "/app.js.map");
    expect(map).toMatchObject({ status: 200, truncated: false });
    expect(map!.body).toContain("sourcesContent");
  });

  it("sees a 404 as a 404, not as an error", async () => {
    expect(await ctx.fetch(bad.url + "/robots.txt")).toMatchObject({ status: 404 });
  });

  it("refuses hosts the page does not use", async () => {
    expect(await ctx.fetch("http://localhost:1/")).toBeNull();
    expect(await ctx.fetch("http://169.254.169.254/latest/meta-data")).toBeNull();
  });
});
