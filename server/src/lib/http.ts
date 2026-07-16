import { CollectError } from './errors.js';
import { logger } from './logger.js';

const DOMAIN_WHITELIST = new Set([
  'api.github.com',
  'hn.algolia.com',
  'www.jiqizhixin.com',
  '36kr.com',
  'www.qbitai.com',
  'open.bigmodel.cn',
]);

/** Check if a URL's domain is in the whitelist (SSRF protection). */
export function isAllowedDomain(url: string): boolean {
  try {
    const parsed = new URL(url);
    return DOMAIN_WHITELIST.has(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Check if a URL is allowed for LLM API calls.
 * More permissive than the collect whitelist: allows any HTTPS domain
 * and localhost (for local LLMs like Ollama).
 */
export function isLlmEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') return true;
    if (parsed.protocol === 'https:') return true;
    return false;
  } catch {
    return false;
  }
}

/** Add a domain to the whitelist (for user-configured RSS feeds). */
export function addAllowedDomain(domain: string): void {
  DOMAIN_WHITELIST.add(domain);
}

interface FetchOptions {
  headers?: Record<string, string>;
  retries?: number;
  timeoutMs?: number;
  source?: string; // For error attribution (e.g. 'github', 'hackernews')
}

/**
 * Fetch with retry, exponential backoff, domain whitelist, and timeout.
 * Throws CollectError on failure with proper categorization.
 */
export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { retries = 3, timeoutMs = 15000, headers, source = 'unknown' } = options;

  if (!isAllowedDomain(url)) {
    throw new CollectError(source, 'auth', `Blocked by domain whitelist: ${url}`);
  }

  let lastError: CollectError | null = null;

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
          logger.warn('collect', source, `HTTP ${resp.status}, retrying in ${backoff}ms (attempt ${attempt + 1}/${retries + 1})`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        lastError = CollectError.fromHttpStatus(source, resp.status, url);
        throw lastError;
      }

      return resp;
    } catch (err) {
      // CollectError from HTTP status above — rethrow
      if (err instanceof CollectError && err.category !== 'network') {
        throw err;
      }

      // Network error or abort — retry
      lastError = CollectError.fromNetworkError(source, err);
      if (attempt < retries) {
        const backoff = Math.pow(2, attempt) * 1000;
        logger.warn('collect', source, `Network error, retrying in ${backoff}ms: ${lastError.message}`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new CollectError(source, 'unknown', `Failed after ${retries + 1} attempts: ${url}`);
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

