export interface Fetched {
  status: number;
  headers: Headers;
  body: string;
}

export type Fetcher = (path: string) => Promise<Fetched>;

// Each marker returns true when its planted issue is present. fixtures/bad must
// return true for every ID and fixtures/good must return false.
export type Marker = (get: Fetcher) => Promise<boolean>;

// Detections are facts about the stack, not problems (reported in `detected`, never scored).
// They are present in BOTH fixtures, so they are tested separately from MARKERS.
export const DETECTIONS: Record<string, Marker> = {
  "SEC-005": async (get) => /https:\/\/[a-z0-9]+\.supabase\.co/.test((await get("/app.js")).body),
};

const SECURITY_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
];

const internalLinks = (html: string): string[] =>
  [...html.matchAll(/<a\b[^>]*\bhref="(\/[^"#?]*)"/gi)].map((m) => m[1]);

export const MARKERS: Record<string, Marker> = {
  "SEC-001": async (get) => /\bsk_live_[A-Za-z0-9]{8,}/.test((await get("/app.js")).body),
  "SEC-002": async (get) => {
    const [bundle, map] = await Promise.all([get("/app.js"), get("/app.js.map")]);
    return map.status === 200 && /sourceMappingURL=app\.js\.map/.test(bundle.body);
  },
  "SEC-003": async (get) => {
    const { headers } = await get("/");
    return SECURITY_HEADERS.some((name) => !headers.has(name));
  },
  "SEO-001": async (get) => {
    const { body } = await get("/");
    return !/<title>[^<]+<\/title>/i.test(body) || !/<meta\s+name="description"/i.test(body);
  },
  "SEO-002": async (get) => {
    const { body } = await get("/");
    return !/property="og:title"/i.test(body) || !/name="twitter:card"/i.test(body);
  },
  "SEO-003": async (get) => {
    const [robots, sitemap] = await Promise.all([get("/robots.txt"), get("/sitemap.xml")]);
    return robots.status !== 200 || sitemap.status !== 200;
  },
  "SEO-004": async (get) => /<meta[^>]+name="robots"[^>]+noindex/i.test((await get("/")).body),
  "SEO-005": async (get) => {
    const { body } = await get("/");
    const h1Count = (body.match(/<h1[\s>]/gi) ?? []).length;
    return h1Count !== 1 || !/<link[^>]+rel="canonical"/i.test(body);
  },
  "A11Y-001": async (get) => {
    const { body } = await get("/");
    const imgWithoutAlt = /<img(?![^>]*\balt=)[^>]*>/i.test(body);
    const inputWithoutLabel = /<input(?![^>]*\btype="(?:hidden|submit)")[^>]*>/i.test(body) && !/<label\b/i.test(body);
    return imgWithoutAlt || inputWithoutLabel;
  },
  "PERF-001": async (get) => {
    const { body } = await get("/");
    const blocking = /<script src="\/big\.js"><\/script>/i.test(body);
    return blocking && (await get("/big.js")).body.length > 1_000_000;
  },
  "HYG-001": async (get) => !/<a\b[^>]*href="[^"]*privacy/i.test((await get("/")).body),
  "HYG-002": async (get) => !/<a\b[^>]*href="[^"]*terms/i.test((await get("/")).body),
  "HYG-003": async (get) =>
    /lorem ipsum|your company|john doe|@example\.com/i.test((await get("/")).body),
  "HYG-004": async (get) =>
    /<link[^>]+rel="icon"[^>]+href="[^"]*vite\.svg"/i.test((await get("/")).body),
  "HYG-005": async (get) => /\bundefinedWidget\.init\(\)/.test((await get("/app.js")).body),
  "HYG-006": async (get) => {
    const links = internalLinks((await get("/")).body);
    const statuses = await Promise.all(links.map(async (link) => (await get(link)).status));
    return statuses.some((status) => status === 404);
  },
};
