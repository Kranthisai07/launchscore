import { Command } from "commander";
import { checkMessage } from "./message.js";

export function main(argv: string[] = process.argv): void {
  const program = new Command();

  program
    .name("launchscore")
    .description("Scan a live website for security, SEO, accessibility, performance, and hygiene issues.")
    .version("0.1.0")
    .argument("<url>", "URL to scan")
    .action((url: string) => {
      console.log(checkMessage(url));
    });

  program.parse(argv);
}

main();
