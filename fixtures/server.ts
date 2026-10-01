import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FAKE_SECRETS } from "./secrets.js";
import { headers as goodHeaders } from "./good/headers.js";
import { headers as badHeaders } from "./bad/headers.js";

export type FixtureName = "good" | "bad";

export interface FixtureServer {
  url: string;
  close(): Promise<void>;
}

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));

const FIXTURE_HEADERS: Record<FixtureName, Record<string, string>> = {
  good: goodHeaders,
  bad: badHeaders,
};

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const TEMPLATED = new Set([".html", ".js", ".svg", ".txt", ".xml"]);

// About 1.5 MB of filler, generated on request so the repo stays small (PERF-001).
const PADDING = "/* filler */\n".repeat(115_000);

function render(text: string, origin: string): string {
  const values: Record<string, string> = { ...FAKE_SECRETS, ORIGIN: origin, PADDING };
  return text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key: string) => values[key] ?? match);
}

export async function startFixtureServer(name: FixtureName): Promise<FixtureServer> {
  const siteDir = path.join(fixturesDir, name, "site");
  const extraHeaders = FIXTURE_HEADERS[name];
  let origin = "";

  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = path.join(siteDir, path.normalize(relative));

    if (!filePath.startsWith(siteDir + path.sep)) {
      res.writeHead(404).end("Not found");
      return;
    }

    try {
      const ext = path.extname(filePath);
      const raw = await readFile(filePath);
      const body = TEMPLATED.has(ext) ? render(raw.toString("utf8"), origin) : raw;
      res.writeHead(200, {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        ...extraHeaders,
      });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders });
      res.end("Not found");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Fixture server failed to bind");
  }
  origin = `http://127.0.0.1:${address.port}`;

  return {
    url: origin,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
      }),
  };
}
