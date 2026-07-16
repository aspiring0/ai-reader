import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { openDb, closeDb } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { runMigrations } from '../src/db/migrations.js';
import { responsePlugin } from '../src/routes/helpers.js';
import { llmRoutes } from '../src/routes/llm.js';
import { PROVIDERS } from '../src/lib/providers.js';
import { isLlmEndpoint } from '../src/lib/http.js';

async function buildApp() {
  const app = Fastify();
  await app.register(responsePlugin);
  await app.register(llmRoutes);
  return app;
}

describe('LLM Provider Presets', () => {
  it('returns a list of providers with required fields', () => {
    expect(PROVIDERS.length).toBeGreaterThanOrEqual(5);
    for (const p of PROVIDERS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.base_url !== undefined).toBe(true);
      expect(typeof p.key_required).toBe('boolean');
    }
  });

  it('includes zhipu, openai, deepseek, and custom', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(ids).toContain('zhipu');
    expect(ids).toContain('openai');
    expect(ids).toContain('deepseek');
    expect(ids).toContain('custom');
  });

  it('zhipu has the correct default', () => {
    const zhipu = PROVIDERS.find((p) => p.id === 'zhipu')!;
    expect(zhipu.base_url).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(zhipu.key_required).toBe(true);
  });

  it('ollama does not require an API key', () => {
    const ollama = PROVIDERS.find((p) => p.id === 'ollama')!;
    expect(ollama.key_required).toBe(false);
    expect(ollama.base_url).toContain('127.0.0.1');
    expect(ollama.docs_url).toBe('https://ollama.com/library');
  });
});


describe('isLlmEndpoint', () => {
  it('allows HTTPS domains', () => {
    expect(isLlmEndpoint('https://api.openai.com/v1/chat/completions')).toBe(true);
    expect(isLlmEndpoint('https://api.deepseek.com/v1/chat/completions')).toBe(true);
  });

  it('allows localhost', () => {
    expect(isLlmEndpoint('http://127.0.0.1:11434/v1/chat/completions')).toBe(true);
    expect(isLlmEndpoint('http://localhost:11434/v1/chat/completions')).toBe(true);
  });

  it('blocks plain HTTP on non-localhost', () => {
    expect(isLlmEndpoint('http://api.example.com/v1/chat/completions')).toBe(false);
  });

  it('blocks invalid URLs', () => {
    expect(isLlmEndpoint('not-a-url')).toBe(false);
  });
});

describe('LLM Routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    process.env.AIRADAR_DB_PATH = ':memory:';
    const db = openDb();
    initSchema(db);
    runMigrations(db);
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  it('GET /api/llm/providers returns provider list', async () => {
    const resp = await app.inject({ method: 'GET', url: '/api/llm/providers' });
    expect(resp.statusCode).toBe(200);
    const json = JSON.parse(resp.body);
    expect(json.ok).toBe(true);
    expect(json.data.providers.length).toBeGreaterThanOrEqual(5);
    const ids = json.data.providers.map((p: { id: string }) => p.id);
    expect(ids).toContain('zhipu');
    expect(ids).toContain('custom');
  });

  it('POST /api/llm/test rejects missing config gracefully', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/api/llm/test',
      payload: { base_url: '', model: '' },
    });
    expect(resp.statusCode).toBe(200);
    const json = JSON.parse(resp.body);
    expect(json.ok).toBe(true);
    expect(json.data.success).toBe(false);
  });
});
