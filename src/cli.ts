import { Command } from "commander";
import { openFile } from "./open.js";
import { scanAndWrite } from "./scan.js";
import { VERSION } from "./version.js";
import { pauseBeforeExit } from "./wait.js";

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = new Command();

  program
    .name("launchscore")
    .description("Scan a live website for security, SEO, accessibility, performance, and hygiene issues.")
    .version(VERSION)
    .argument("<url>", "URL to scan")
    .option("-o, --out <dir>", "folder to write the report into", ".")
    .option("--no-perf", "skip the performance test (it is slow on big sites)")
    .option("--open", "open the web report in your browser when the scan finishes")
    .option("--no-wait", "do not wait for Enter before closing (for scripts)")
    .action(async (url: string, opts: { out: string; perf: boolean; open?: boolean; wait: boolean }) => {
      try {
        const summary = await scanAndWrite(url, opts.out, {
          skipPerformance: !opts.perf,
          onStatus: (message) => console.error(message),
        });
        console.log(`Score: ${summary.score === null ? "not scored" : `${summary.score}/100`} (${summary.verdict})`);
        if (summary.partial) {
          const missing = summary.untestedCategories.length ? `not tested: ${summary.untestedCategories.join(", ")}` : "some checks or scripts were skipped";
          console.log(`Partial scan, ${missing}`);
        }
        console.log(`Checks run: ${summary.checksRun}`);
        console.log(`Findings: ${summary.findings}`);
        console.log(`Detected: ${summary.detected}`);
        console.log(`Not tested: ${summary.notTested}`);
        console.log(`Report: ${summary.reportPath}`);
        console.log(`Web report: ${summary.htmlPath}`);
        for (const card of summary.cardPaths) console.log(`Card: ${card}`);
        if (summary.cardError) console.warn(`Could not create the share cards: ${summary.cardError}`);
        if (opts.open) {
          openFile(summary.htmlPath, () => console.warn(`Could not open the browser. Open this file yourself: ${summary.htmlPath}`));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/Executable doesn't exist/i.test(message)) {
          console.error("The browser launchscore needs is not installed yet. Run: npx playwright install chromium");
        } else {
          console.error(message.split("\n")[0]);
        }
        process.exitCode = 1;
      }
      // Keeps the window open so the result (or the error) can be read.
      await pauseBeforeExit(!opts.wait);
    });

  await program.parseAsync(argv);
}

void main();
