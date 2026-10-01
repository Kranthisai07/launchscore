import type { Check } from "../types.js";
import { sec001 } from "./sec-001.js";
import { sec003 } from "./sec-003.js";
import { sec004 } from "./sec-004.js";
import { seo001 } from "./seo-001.js";
import { hyg003 } from "./hyg-003.js";

export const checks: Check[] = [sec001, sec003, sec004, seo001, hyg003];
