import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pauseBeforeExit } from "../src/wait.js";
import { tally, tallyMarkdown, tallyText } from "./validate-lib.js";

// pnpm validate:tally [review file] [--no-wait]   (default file: validation/review.md)
const args = process.argv.slice(2);
const noWait = args.includes("--no-wait");
const reviewPath = args.find((a) => a !== "--no-wait") ?? path.join("validation", "review.md");

async function main(): Promise<number> {
  let markdown: string;
  try {
    markdown = await readFile(reviewPath, "utf8");
  } catch {
    console.error(`Could not read ${reviewPath}. Run pnpm validate first, then fill in the Verdict column.`);
    return 1;
  }

  const result = tally(markdown);
  const o = result.overall;
  if (o.TP + o.FP + o.unsure + o.unmarked + o.unrecognised === 0) {
    console.error("No review rows found in that file.");
    return 1;
  }

  const out = path.join(path.dirname(reviewPath), "tally.md");
  await writeFile(out, tallyMarkdown(result, new Date().toISOString()), "utf8");

  console.log(tallyText(result));
  console.log("");
  console.log(`False positives marked: ${result.falsePositives.length}`);
  if (o.unmarked > 0) console.log(`Rows not marked yet: ${o.unmarked}`);
  if (result.unrecognised.length > 0) console.log(`Verdicts not recognised (use TP, FP or unsure): ${result.unrecognised.length}`);
  console.log(`Written: ${path.resolve(out)}`);
  return 0;
}

const code = await main();
await pauseBeforeExit(noWait);
process.exit(code);
