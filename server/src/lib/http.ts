const DOMAIN_WHITELIST = new Set([
  'api.github.com',
  'hn.algolia.com',
  'www.jiqizhixin.com',
  '36kr.com',
  'www.qbitai.com',
  'open.bigmodel.cn',
]);

/** Check if a URL's domain is in the whitelist. */
export function isAllowedDomain(url: string): boolean {
  try {
    const parsed = new URL(url);
    return DOMAIN_WHITELIST.has(parsed.hostname);
  } catch {
    return false;
  }
}

interface FetchOptions {
  headers?: Record<string, string>;
  retries?: number;
  timeoutMs?: number;
}

/** Fetch with retry and exponential backoff. */
export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { retries = 3, timeoutMs = 15000, headers } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Retry on 429 (rate limit) and 5xx
      if (resp.status === 429 || resp.status >= 500) {
        if (attempt < retries) {
          const backoff = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
      }

      return resp;
    } catch (err) {
      if (attempt === retries) throw err;
      const backoff = Math.pow(2, attempt) * 1000;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw new Error(`Failed after ${retries + 1} attempts: ${url}`);
}

/** Rate limiter for sequential API calls. */
export class RateLimiter {
  private lastCall = 0;
  constructor(private minIntervalMs: number) {}

  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastCall;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastCall = Date.now();
  }
}

/** Add a domain to the whitelist (for user-configured RSS feeds). */
export function addAllowedDomain(domain: string): void {
  DOMAIN_WHITELIST.add(domain);
}
