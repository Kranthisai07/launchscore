import { readFile } from "node:fs/promises";
import path from "node:path";
import { pauseBeforeExit } from "../src/wait.js";
import { NotIgnoredError, parseSiteList, runValidation, summaryText } from "./validate-lib.js";

// pnpm validate <sites file> [--out <dir>] [--no-wait]
// Scans each site in the file, one after another, passive checks only, with the speed test on.
// Unless --no-wait is given, it waits for Enter at the end so a window opened for it does not vanish.
const args = process.argv.slice(2);
let file: string | undefined;
let outDir = "validation";
let noWait = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out") outDir = args[++i] ?? outDir;
  else if (args[i] === "--no-wait") noWait = true;
  else if (!file) file = args[i];
}

async function main(): Promise<number> {
  if (!file) {
    console.error("Usage: pnpm validate <file with one URL per line> [--out <folder>] [--no-wait]");
    console.error("Name the file sites.local.txt so git ignores it.");
    return 1;
  }

  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    console.error(`Could not read ${file}`);
    return 1;
  }

  const { urls, errors } = parseSiteList(text);
  for (const e of errors) console.error(`${file} line ${e.line}: skipped "${e.text}" (${e.message})`);
  if (urls.length === 0) {
    console.error("No usable URLs in the file. Add one address per line (lines starting with # are ignored).");
    return 1;
  }

  console.log("Only scan sites you own or have permission to scan.");
  console.log(`Scanning ${urls.length} site${urls.length === 1 ? "" : "s"}, one at a time (passive checks, speed test on).`);
  console.log("");

  try {
    const run = await runValidation({ urls, outDir, guardPaths: [file] });
    for (const line of summaryText(run.summary)) console.log(line);
    console.log("");
    if (run.keptReview) {
      console.log(`Your marked-up ${path.resolve(run.keptReview)} has verdicts, so it was NOT overwritten.`);
      console.log(`The new table was written to a separate file: ${path.resolve(run.reviewPath)}`);
    } else {
      console.log(`Review table: ${path.resolve(run.reviewPath)}`);
    }
    console.log(`Summary:      ${path.resolve(run.summaryPath)}`);
    console.log(`Mark each row TP, FP or unsure, then run: pnpm validate:tally${run.keptReview ? ` ${path.relative(process.cwd(), run.reviewPath)}` : ""}`);
    return 0;
  } catch (err) {
    if (err instanceof NotIgnoredError) {
      console.error(err.message);
      return 2;
    }
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

const code = await main();
await pauseBeforeExit(noWait);
process.exit(code);
