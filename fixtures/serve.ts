import { startFixtureServer, type FixtureName } from "./server.js";

const name = process.argv[2];
if (name !== "good" && name !== "bad") {
  console.error("Usage: pnpm fixture good|bad");
  process.exit(1);
}

const server = await startFixtureServer(name as FixtureName);
console.log(`${name} fixture running at ${server.url}`);
console.log("Press Ctrl+C to stop.");

process.on("SIGINT", () => {
  void server.close().finally(() => process.exit(0));
});
