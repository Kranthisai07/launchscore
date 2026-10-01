import type { ExtraRoute } from "../../fixtures/server.js";

// Test-only pages and scripts served through the fixture server's extraRoutes, for the script limits and
// for redirected scripts. The real fixtures never contain these.
const html = (scripts: string[]): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Script test page</title></head><body><h1>Scripts</h1>${scripts
    .map((src) => `<script src="${src}"></script>`)
    .join("")}</body></html>`;

const page =
  (scripts: string[]): ExtraRoute =>
  (_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html(scripts));
  };

const script =
  (body: string): ExtraRoute =>
  (_req, res) => {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }).end(body);
  };

export const MANY = 150;
export const SIZED = 5;
const sizedBody = (n: number): string => `window.__sized${n}=${n};\n/* ${"x".repeat(1000)} */\n`; // about 1 KB each

export function scriptRoutes(): Record<string, ExtraRoute> {
  const routes: Record<string, ExtraRoute> = {};

  // 150 small scripts: all of them should be read
  const many = Array.from({ length: MANY }, (_, i) => `/many/${i}.js`);
  routes["/many"] = page(many);
  many.forEach((src, i) => (routes[src] = script(`window.__many${i}=${i};`)));

  // five scripts of about 1 KB each, for the total size limit
  const sized = Array.from({ length: SIZED }, (_, i) => `/sized/${i}.js`);
  routes["/sized"] = page(sized);
  sized.forEach((src, i) => (routes[src] = script(sizedBody(i))));

  // a script address that redirects (302) to the real file
  routes["/redirect-page"] = page(["/redir.js"]);
  routes["/redir.js"] = (_req, res) => {
    res.writeHead(302, { Location: "/target.js" }).end();
  };
  routes["/target.js"] = script('window.__target="reached";');

  return routes;
}
