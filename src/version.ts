import { createRequire } from "node:module";

// package.json sits one folder above both src/ and the bundled dist/cli.js, so one path serves both.
const require = createRequire(import.meta.url);

export const VERSION: string = (require("../package.json") as { version: string }).version;
