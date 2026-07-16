import type { FastifyInstance } from 'fastify';
import { PROVIDERS } from '../lib/providers.js';
import { getSettings } from '../lib/config.js';
import { isLlmEndpoint } from '../lib/http.js';
import { ok } from './helpers.js';
import { logger } from '../lib/logger.js';

/**
 * POST /api/llm/test
 * Sends a 1-token ping to verify the LLM connection works.
 * Uses settings if body is empty, or the provided values for pre-save testing.
 */
async function testConnection(
  body: { provider?: string; model?: string; api_key?: string; base_url?: string },
): Promise<{ success: boolean; message: string }> {
  const settings = getSettings();
  const baseUrl = (body.base_url || settings.llm_base_url || '').replace(/\/$/, '');
  const model = body.model || settings.llm_model || '';
  const apiKey = body.api_key || settings.llm_api_key || '';

  if (!baseUrl) return { success: false, message: 'Base URL not configured' };
  if (!model) return { success: false, message: 'Model not configured' };

  const endpoint = `${baseUrl}/chat/completions`;
  if (!isLlmEndpoint(endpoint)) {
    return { success: false, message: 'Endpoint must be HTTPS or localhost' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (resp.status === 401 || resp.status === 403) {
      return { success: false, message: `Authentication failed (${resp.status})` };
    }
    if (resp.status === 404) {
      return { success: false, message: 'Model not found or endpoint incorrect' };
    }
    if (resp.status === 429) {
      return { success: false, message: 'Rate limited - connection works but too many requests' };
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { success: false, message: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
    }

    return { success: true, message: `Connected successfully (${model})` };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, message: 'Connection timed out (10s)' };
    }
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function llmRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/llm/providers', async (_req, reply) => {
    return ok(reply, { providers: PROVIDERS });
  });

  app.post<{ Body: { provider?: string; model?: string; api_key?: string; base_url?: string } }>(
    '/api/llm/test',
    async (req, reply) => {
      const body = req.body ?? {};
      logger.info('system', 'llm-test', `Testing connection: provider=${body.provider || '(from settings)'}`);
      const result = await testConnection(body);
      return ok(reply, result);
    },
  );
}
