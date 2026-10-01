import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tally, tallyMarkdown, tallyText } from "./validate-lib.js";

// pnpm validate:tally [review file]   (default: validation/review.md)
const reviewPath = process.argv[2] ?? path.join("validation", "review.md");

let markdown: string;
try {
  markdown = await readFile(reviewPath, "utf8");
} catch {
  console.error(`Could not read ${reviewPath}. Run pnpm validate first, then fill in the Verdict column.`);
  process.exit(1);
}

const result = tally(markdown);
if (result.overall.TP + result.overall.FP + result.overall.unsure + result.overall.unmarked + result.overall.unrecognised === 0) {
  console.error("No review rows found in that file.");
  process.exit(1);
}

const out = path.join(path.dirname(reviewPath), "tally.md");
await writeFile(out, tallyMarkdown(result, new Date().toISOString()), "utf8");

console.log(tallyText(result));
console.log("");
console.log(`False positives marked: ${result.falsePositives.length}`);
if (result.overall.unmarked > 0) console.log(`Rows not marked yet: ${result.overall.unmarked}`);
if (result.unrecognised.length > 0) console.log(`Verdicts not recognised (use TP, FP or unsure): ${result.unrecognised.length}`);
console.log(`Written: ${path.resolve(out)}`);
