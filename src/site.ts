import { isUnderHostingSuffix } from "./data/hosting-suffixes.js";

const IP_ADDRESS = /^\d+(\.\d+){3}$|:/;
// Second-level suffixes under a two-letter country code (shop.co.uk). Not the full Public Suffix List: a miss here
// can only make us treat two names as different sites, which means a check stays quiet, never a false report.
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);

function registrableDomain(host: string): string {
  const labels = host.split(".");
  const keep = labels.length >= 3 && labels[labels.length - 1].length === 2 && SECOND_LEVEL.has(labels[labels.length - 2]) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

// True when both names belong to the same owner: the same name, or the same registrable domain
// (api.shop.com and shop.com). Names under a shared hosting platform (myapp.lovable.app) and IP addresses
// only match when they are exactly the same name.
export function isSameSite(a: string, b: string): boolean {
  const x = a.toLowerCase().replace(/\.$/, "");
  const y = b.toLowerCase().replace(/\.$/, "");
  if (x === y) return true;
  if (IP_ADDRESS.test(x) || IP_ADDRESS.test(y) || !x.includes(".") || !y.includes(".")) return false;
  if (isUnderHostingSuffix(x) || isUnderHostingSuffix(y)) return false;
  return registrableDomain(x) === registrableDomain(y);
}
