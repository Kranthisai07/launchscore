// The one way checks make their own requests to the target. A normal visitor or crawler would
// make the same requests (a script's source map, robots.txt, the http:// address).
//
// Rules: at most 5 in flight, 10 s timeout, same-host redirects only, and only to hosts the page
// itself already uses, so a hostile page cannot aim this machine at localhost or a LAN address.

export interface FetchResult {
  url: string; // final URL after any same-host redirects
  status: number;
  headers: Record<string, string>; // keys lowercased
  body: string;
  truncated: boolean; // the body was cut at maxBytes
}

export interface FetchOptions {
  maxBytes?: number; // default 1 MB
  followRedirects?: boolean; // default true (same host only)
}

// null means the request was blocked, timed out, or failed: callers treat it as "unknown".
export type PageFetch = (url: string, options?: FetchOptions) => Promise<FetchResult | null>;

type FetchImpl = (
  url: string,
  init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> },
) => Promise<Response>;

export interface FetcherOptions {
  allowedHosts: Iterable<string>; // hostnames, without port
  concurrency?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  fetchImpl?: FetchImpl;
}

export const MAX_CONCURRENT_REQUESTS = 5;
export const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function readBody(res: Response, maxBytes: number): Promise<{ body: string; truncated: boolean }> {
  if (!res.body) return { body: "", truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      chunks.push(value.subarray(0, value.length - (total - maxBytes)));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return { body: Buffer.concat(chunks).toString("utf8"), truncated };
}

export function createFetcher(options: FetcherOptions): PageFetch {
  const allowed = new Set([...options.allowedHosts].map((h) => h.toLowerCase()));
  const concurrency = options.concurrency ?? MAX_CONCURRENT_REQUESTS;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? 3;
  const fetchImpl: FetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));

  let inFlight = 0;
  const waiting: (() => void)[] = [];
  const acquire = async (): Promise<void> => {
    if (inFlight < concurrency) {
      inFlight++;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
  };
  const release = (): void => {
    const next = waiting.shift();
    if (next) next(); // hand the slot straight to the next waiter
    else inFlight--;
  };

  const permitted = (url: URL): boolean =>
    (url.protocol === "http:" || url.protocol === "https:") && allowed.has(url.hostname.toLowerCase());

  return async (rawUrl, opts = {}) => {
    const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    const follow = opts.followRedirects ?? true;
    let current: URL;
    try {
      current = new URL(rawUrl);
    } catch {
      return null;
    }

    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (!permitted(current)) return null;

      await acquire();
      let result: FetchResult;
      try {
        const res = await fetchImpl(current.href, {
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
          headers: { "user-agent": "launchscore" },
        });
        const headers = Object.fromEntries([...res.headers].map(([k, v]) => [k.toLowerCase(), v]));
        const isRedirect = REDIRECT_STATUSES.has(res.status);
        const { body, truncated } = isRedirect ? { body: "", truncated: false } : await readBody(res, maxBytes);
        if (isRedirect) await res.body?.cancel().catch(() => undefined);
        result = { url: current.href, status: res.status, headers, body, truncated };
      } catch {
        return null; // network error, timeout, or an unreadable body
      } finally {
        release();
      }

      const location = result.headers["location"];
      if (!follow || !REDIRECT_STATUSES.has(result.status) || !location) return result;

      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return result;
      }
      // Never follow a redirect to another host: hand the 3xx back to the caller.
      if (next.hostname.toLowerCase() !== current.hostname.toLowerCase()) return result;
      current = next;
    }
    return null; // too many redirects
  };
}
