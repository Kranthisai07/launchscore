import net from "node:net";
import { chromium } from "playwright";

// What the PERF check reads from a Lighthouse result. Everything else is dropped on purpose.
export interface LighthouseAudit {
  id: string;
  title: string;
  score: number | null;
  scoreDisplayMode: string;
  metricSavings?: Record<string, number>; // estimated saving per metric, in ms (CLS is unitless)
  overallSavingsBytes?: number;
}

export interface LighthouseSummary {
  score: number | null; // performance category score, 0 to 1
  audits: LighthouseAudit[]; // only audits that estimate a saving
}

export const LIGHTHOUSE_TIMEOUT_MS = 60_000;

const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

// Shrinks a full Lighthouse result (hundreds of KB) to the fields above.
export function trimLhr(lhr: unknown): LighthouseSummary {
  const root = lhr as {
    categories?: { performance?: { score?: unknown } };
    audits?: Record<string, { title?: unknown; score?: unknown; scoreDisplayMode?: unknown; metricSavings?: unknown; details?: { overallSavingsBytes?: unknown } }>;
  };
  const audits: LighthouseAudit[] = [];
  for (const [id, audit] of Object.entries(root.audits ?? {})) {
    if (typeof audit.metricSavings !== "object" || audit.metricSavings === null) continue;
    const savings: Record<string, number> = {};
    for (const [metric, value] of Object.entries(audit.metricSavings)) {
      const n = num(value);
      if (n !== undefined) savings[metric] = n;
    }
    audits.push({
      id,
      title: typeof audit.title === "string" ? audit.title : id,
      score: num(audit.score) ?? null,
      scoreDisplayMode: typeof audit.scoreDisplayMode === "string" ? audit.scoreDisplayMode : "",
      metricSavings: savings,
      overallSavingsBytes: num(audit.details?.overallSavingsBytes),
    });
  }
  return { score: num(root.categories?.performance?.score) ?? null, audits };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

// Lighthouse, performance only, mobile preset, driving Playwright's own Chromium through a debugging
// port (no second browser download). Always closes the browser; gives up after timeoutMs.
export async function runLighthouse(url: string, timeoutMs = LIGHTHOUSE_TIMEOUT_MS): Promise<LighthouseSummary> {
  const port = await freePort();
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
  let timer: NodeJS.Timeout | undefined;
  try {
    // Loaded only when needed, so scans that skip performance never pay for it.
    const { default: lighthouse } = await import("lighthouse");
    const run = lighthouse(url, {
      port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance"],
      formFactor: "mobile",
    }).then((result) => {
      if (!result) throw new Error("Lighthouse returned no result");
      return trimLhr(result.lhr);
    });
    run.catch(() => undefined); // if the timeout wins, the late rejection must not go unhandled
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        void browser.close().catch(() => undefined); // closing the browser stops Lighthouse
        reject(new Error(`Lighthouse timed out after ${Math.round(timeoutMs / 1000)} s`));
      }, timeoutMs);
    });
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
    await browser.close().catch(() => undefined);
  }
}
