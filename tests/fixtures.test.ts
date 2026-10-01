import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startFixtureServer, type FixtureName, type FixtureServer } from "../fixtures/server.js";
import { DETECTIONS, MARKERS, type Fetcher } from "../fixtures/markers.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

const manifestIds = [
  ...readFileSync(path.join(fixturesDir, "bad", "MANIFEST.md"), "utf8").matchAll(
    /^\|\s*([A-Z0-9]+-\d{3})\s*\|/gm,
  ),
].map((m) => m[1]);

const servers = {} as Record<FixtureName, FixtureServer>;
const fetchers = {} as Record<FixtureName, Fetcher>;

beforeAll(async () => {
  for (const name of ["good", "bad"] as const) {
    servers[name] = await startFixtureServer(name);
    const base = servers[name].url;
    fetchers[name] = async (p) => {
      const res = await fetch(base + p);
      return { status: res.status, headers: res.headers, body: await res.text() };
    };
  }
});

afterAll(async () => {
  await Promise.all(Object.values(servers).map((s) => s.close()));
});

describe("fixture servers", () => {
  it.each(["good", "bad"] as const)("%s serves / with 200 on a random local port", async (name) => {
    expect(servers[name].url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect((await fetchers[name]("/")).status).toBe(200);
  });

  it("good sends all five security headers and bad sends none", async () => {
    const names = [
      "content-security-policy",
      "strict-transport-security",
      "x-frame-options",
      "x-content-type-options",
      "referrer-policy",
    ];
    const good = (await fetchers.good("/")).headers;
    const bad = (await fetchers.bad("/")).headers;
    for (const name of names) {
      expect(good.has(name), `good missing ${name}`).toBe(true);
      expect(bad.has(name), `bad has ${name}`).toBe(false);
    }
  });

  it("good serves its supporting pages and files", async () => {
    for (const p of ["/app.js", "/robots.txt", "/sitemap.xml", "/privacy.html", "/terms.html", "/favicon.svg"]) {
      expect((await fetchers.good(p)).status, p).toBe(200);
    }
  });

  it("good keeps publishable keys as negative controls", async () => {
    const { body } = await fetchers.good("/app.js");
    expect(body).toMatch(/pk_test_/);
    const jwt = body.match(/eyJ[\w-]+\.(eyJ[\w-]+)\.[\w-]+/);
    expect(jwt).not.toBeNull();
    expect(JSON.parse(Buffer.from(jwt![1], "base64url").toString()).role).toBe("anon");
  });

  it("bad serves a decodable service_role JWT", async () => {
    const { body } = await fetchers.bad("/app.js");
    const roles = [...body.matchAll(/eyJ[\w-]+\.(eyJ[\w-]+)\.[\w-]+/g)].map(
      (m) => JSON.parse(Buffer.from(m[1], "base64url").toString()).role,
    );
    expect(roles).toContain("service_role");
  });
});

describe("planted issues", () => {
  it("MANIFEST.md and markers.ts list the same check IDs", () => {
    expect([...manifestIds].sort()).toEqual(
      [...Object.keys(MARKERS), ...Object.keys(DETECTIONS)].sort(),
    );
  });

  it.each(Object.keys(MARKERS))("%s is present in bad and absent from good", async (id) => {
    const marker = MARKERS[id];
    expect(marker, `no marker for ${id}`).toBeDefined();
    expect(await marker(fetchers.bad), `${id} not planted in bad`).toBe(true);
    expect(await marker(fetchers.good), `${id} found in good`).toBe(false);
  });
});

describe("detections (not findings)", () => {
  it.each(Object.keys(DETECTIONS))("%s is detected in both good and bad", async (id) => {
    expect(await DETECTIONS[id](fetchers.bad), `${id} not detected in bad`).toBe(true);
    expect(await DETECTIONS[id](fetchers.good), `${id} not detected in good`).toBe(true);
  });

  it("no detection ID is also a planted-issue marker", () => {
    for (const id of Object.keys(DETECTIONS)) expect(MARKERS[id]).toBeUndefined();
  });
});

describe("repo hygiene", () => {
  it("no full fake key literal is committed under fixtures/", () => {
    const literal = /\b(?:sk_live_|pk_test_)[A-Za-z0-9]{8,}|eyJ[\w-]{10,}\.eyJ[\w-]{10,}/;
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
      );
    for (const file of walk(fixturesDir).filter((f) => !f.endsWith(".png"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(literal);
    }
  });
});
