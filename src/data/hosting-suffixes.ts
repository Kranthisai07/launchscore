// Hosting platforms where every customer gets a name under the platform's own domain
// (myapp.lovable.app, other.lovable.app). Two names under one of these belong to different people, so they are
// never treated as the same site.
//
// Source: the PRIVATE DOMAINS section of the Public Suffix List,
// https://github.com/publicsuffix/list/blob/main/public_suffix_list.dat
// at commit 6cd82aff889e3d64e5e03bc5c1f43da1934a960a (2026-10-01).
// Each entry below was checked to be present in that section; entries that could not be found there are left out
// on purpose (for example v0.app, lovable.dev and railway.app are NOT in the list, while v0.build,
// vusercontent.net, bolt.host and up.railway.app are).
export const HOSTING_SUFFIXES: ReadonlySet<string> = new Set([
  "lovable.app",
  "lovableproject.com",
  "lovable.run",
  "lovable.sh",
  "vercel.app",
  "vercel.dev",
  "now.sh",
  "netlify.app",
  "github.io",
  "gitlab.io",
  "pages.dev",
  "workers.dev",
  "streamlit.app",
  "streamlitapp.com",
  "onrender.com",
  "replit.app",
  "replit.dev",
  "repl.co",
  "bolt.host",
  "v0.build",
  "vusercontent.net",
  "web.app",
  "firebaseapp.com",
  "herokuapp.com",
  "fly.dev",
  "surge.sh",
  "framer.app",
  "framer.website",
  "webflow.io",
  "wixsite.com",
  "wixstudio.com",
  "azurewebsites.net",
  "appspot.com",
  "up.railway.app",
  "deno.dev",
  "val.run",
  "hf.space",
  "csb.app",
  "pythonanywhere.com",
  "carrd.co",
  "bubbleapps.io",
  "supabase.co",
  "cloudfront.net",
]);

export function isUnderHostingSuffix(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  for (const suffix of HOSTING_SUFFIXES) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return true;
  }
  return false;
}
