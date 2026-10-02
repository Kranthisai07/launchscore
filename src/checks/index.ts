import type { Check } from "../types.js";
import { sec001 } from "./sec-001.js";
import { sec002 } from "./sec-002.js";
import { sec003 } from "./sec-003.js";
import { sec004 } from "./sec-004.js";
import { sec005 } from "./sec-005.js";
import { seo001 } from "./seo-001.js";
import { seo002 } from "./seo-002.js";
import { seo003 } from "./seo-003.js";
import { seo004 } from "./seo-004.js";
import { seo005 } from "./seo-005.js";
import { seo006 } from "./seo-006.js";
import { a11y001 } from "./a11y-001.js";
import { perf001 } from "./perf-001.js";
import { hyg001 } from "./hyg-001.js";
import { hyg002 } from "./hyg-002.js";
import { hyg003 } from "./hyg-003.js";
import { hyg004 } from "./hyg-004.js";
import { hyg005 } from "./hyg-005.js";
import { hyg006 } from "./hyg-006.js";

export const checks: Check[] = [
  sec001, sec002, sec003, sec004, sec005,
  seo001, seo002, seo003, seo004, seo005, seo006,
  a11y001,
  perf001,
  hyg001, hyg002, hyg003, hyg004, hyg005, hyg006,
];
