/**
 * Unified LLM Client
 *
 * Single entry point for all OpenAI-compatible /chat/completions calls.
 * Provides retry, exponential backoff, timeout, and structured error
 * classification. All other LLM functions (interpretItem, testConnection,
 * diagnoseError) delegate here.
 */

import type { Settings } from '@shared/types';
import { isLlmEndpoint } from './http.js';

// ---- Error types (moved here from llm.ts) ----

export type LlmErrorCategory = 'auth' | 'rate_limit' | 'timeout' | 'parse' | 'network' | 'unknown';

export class LlmError extends Error {
  readonly category: LlmErrorCategory;
  readonly statusCode?: number;

  constructor(category: LlmErrorCategory, message: string, statusCode?: number) {
    super(message);
    this.name = 'LlmError';
    this.category = category;
    this.statusCode = statusCode;
  }
}

// ---- Chat types ----

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  baseUrlOverride?: string;
  apiKeyOverride?: string;
  modelOverride?: string;
}

export interface LlmChatResult {
  content: string;
  model: string;
}

// ---- Constants ----

const DEFAULT_MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 1000;

// ---- Core function ----

/**
 * Core LLM chat call with retry, backoff, timeout, and error classification.
 * Throws LlmError on failure.
 */
export async function llmChat(
  opts: LlmChatOptions,
  settings: Settings,
): Promise<LlmChatResult> {
  const baseUrl = (opts.baseUrlOverride || settings.llm_base_url || '').replace(/\/+$/, '');
  const apiKey = opts.apiKeyOverride || settings.llm_api_key || '';
  const model = opts.modelOverride || settings.llm_model || '';
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = opts.timeoutMs ?? settings.llm_timeout_ms;

  const endpoint = baseUrl + '/chat/completions';
  if (!isLlmEndpoint(endpoint)) {
    throw new LlmError('auth', 'LLM endpoint must be HTTPS or localhost');
  }

  const body = JSON.stringify({
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;

  let lastError: LlmError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (resp.status === 401 || resp.status === 403) {
        throw new LlmError('auth', 'LLM auth failed (' + resp.status + ')', resp.status);
      }

      if (resp.status === 429) {
        lastError = new LlmError('rate_limit', 'LLM rate limited (429)', 429);
        if (attempt < maxRetries) {
          await sleep(BACKOFF_BASE_MS * Math.pow(2, attempt));
          continue;
        }
        throw lastError;
      }

      if (resp.status >= 500) {
        lastError = new LlmError('network', 'LLM server error (' + resp.status + ')', resp.status);
        if (attempt < maxRetries) {
          await sleep(BACKOFF_BASE_MS * Math.pow(2, attempt));
          continue;
        }
        throw lastError;
      }

      if (!resp.ok) {
        throw new LlmError('unknown', 'LLM request failed (' + resp.status + ')', resp.status);
      }

      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content ?? '';
      return { content, model };
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof LlmError) {
        if (err.category === 'auth') throw err;
        if (err.category === 'rate_limit' || err.category === 'network') {
          if (attempt < maxRetries) continue;
          throw err;
        }
        throw err;
      }

      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new LlmError('timeout', 'LLM request timed out');
        if (attempt < maxRetries) continue;
        throw lastError;
      }

      lastError = new LlmError('network', err instanceof Error ? err.message : String(err));
      if (attempt < maxRetries) continue;
      throw lastError;
    }
  }

  throw lastError ?? new LlmError('unknown', 'LLM request exhausted retries');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}