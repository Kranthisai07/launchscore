import { readFile } from "node:fs/promises";
import path from "node:path";
import { NotIgnoredError, parseSiteList, runValidation, summaryText } from "./validate-lib.js";

// pnpm validate <sites file> [--out <dir>]
// Scans each site in the file, one after another, passive checks only, with the speed test on.
const args = process.argv.slice(2);
let file: string | undefined;
let outDir = "validation";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out") outDir = args[++i] ?? outDir;
  else if (!file) file = args[i];
}

if (!file) {
  console.error("Usage: pnpm validate <file with one URL per line> [--out <folder>]");
  console.error("Name the file sites.local.txt so git ignores it.");
  process.exit(1);
}

let text: string;
try {
  text = await readFile(file, "utf8");
} catch {
  console.error(`Could not read ${file}`);
  process.exit(1);
}

const { urls, errors } = parseSiteList(text);
for (const e of errors) console.error(`${file} line ${e.line}: skipped "${e.text}" (${e.message})`);
if (urls.length === 0) {
  console.error("No usable URLs in the file.");
  process.exit(1);
}

console.log("Only scan sites you own or have permission to scan.");
console.log(`Scanning ${urls.length} site${urls.length === 1 ? "" : "s"}, one at a time (passive checks, speed test on).`);
console.log("");

try {
  const run = await runValidation({ urls, outDir, guardPaths: [file] });
  for (const line of summaryText(run.summary)) console.log(line);
  console.log("");
  console.log(`Review table: ${path.resolve(run.reviewPath)}`);
  console.log(`Summary:      ${path.resolve(run.summaryPath)}`);
  console.log("Mark each row TP, FP or unsure, then run: pnpm validate:tally");
} catch (err) {
  if (err instanceof NotIgnoredError) {
    console.error(err.message);
    process.exit(2);
  }
  throw err;
}
