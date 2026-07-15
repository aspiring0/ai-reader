/** Typed errors for unified async/exception management. */

export type ErrorCategory = 'rate_limit' | 'network' | 'parse' | 'auth' | 'not_found' | 'unknown';

export class CollectError extends Error {
  readonly category: ErrorCategory;
  readonly source: string;
  readonly statusCode?: number;

  constructor(source: string, category: ErrorCategory, message: string, statusCode?: number) {
    super(message);
    this.name = 'CollectError';
    this.source = source;
    this.category = category;
    this.statusCode = statusCode;
  }

  static fromHttpStatus(source: string, status: number, context: string): CollectError {
    if (status === 403 || status === 429) {
      return new CollectError(source, 'rate_limit', `${context}: rate limited (${status})`, status);
    }
    if (status === 401) {
      return new CollectError(source, 'auth', `${context}: unauthorized`, status);
    }
    if (status === 404) {
      return new CollectError(source, 'not_found', `${context}: not found`, status);
    }
    return new CollectError(source, 'unknown', `${context}: HTTP ${status}`, status);
  }

  static fromNetworkError(source: string, err: unknown): CollectError {
    const msg = err instanceof Error ? err.message : String(err);
    return new CollectError(source, 'network', msg);
  }

  static fromParseError(source: string, err: unknown): CollectError {
    const msg = err instanceof Error ? err.message : String(err);
    return new CollectError(source, 'parse', `Parse error: ${msg}`);
  }
}
