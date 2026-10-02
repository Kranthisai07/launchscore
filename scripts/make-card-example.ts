// Renders docs/card-example.png for the README: the bad fixture's real findings, shown under a demo
// hostname. Only the address is swapped; findings, score and layout come from the real scan and the
// real card renderer. Run: pnpm tsx scripts/make-card-example.ts
// The speed score comes from Lighthouse and moves a little between runs, so the total can too.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { startFixtureServer } from "../fixtures/server.js";
import { renderCardImages } from "../src/report/card.js";
import { buildReport } from "../src/report/json.js";
import { runScan } from "../src/runner.js";

const DEMO_URL = "https://your-app.lovable.app/";
const OUT_DIR = "docs";

const server = await startFixtureServer("bad");
try {
  const report = buildReport(await runScan(server.url + "/", {}));
  const images = await renderCardImages({ ...report, url: DEMO_URL });
  await mkdir(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, "card-example.png");
  await writeFile(file, images.landscape);
  console.log(`Wrote ${file}: ${report.score}/100 ${report.verdict}, ${report.findings.length} findings`);
} finally {
  await server.close();
}
