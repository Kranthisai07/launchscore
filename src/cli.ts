import { Command } from "commander";
import { scanAndWrite } from "./scan.js";

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = new Command();

  program
    .name("launchscore")
    .description("Scan a live website for security, SEO, accessibility, performance, and hygiene issues.")
    .version("0.1.0")
    .argument("<url>", "URL to scan")
    .option("-o, --out <dir>", "folder to write the report into", ".")
    .action(async (url: string, opts: { out: string }) => {
      try {
        const summary = await scanAndWrite(url, opts.out);
        console.log(`Checks run: ${summary.checksRun}`);
        console.log(`Findings: ${summary.findings}`);
        console.log(`Detected: ${summary.detected}`);
        console.log(`Not tested: ${summary.notTested}`);
        console.log(`Report: ${summary.reportPath}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/Executable doesn't exist/i.test(message)) {
          console.error("The browser launchscore needs is not installed yet. Run: npx playwright install chromium");
        } else {
          console.error(message.split("\n")[0]);
        }
        process.exitCode = 1;
      }
    });

  await program.parseAsync(argv);
}

void main();
