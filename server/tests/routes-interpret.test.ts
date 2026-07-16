 import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
 import Fastify from 'fastify';
 import { openDb, closeDb } from '../src/db/connection.js';
 import { initSchema } from '../src/db/schema.js';
 import { runMigrations } from '../src/db/migrations.js';
 import { upsertItem, setSetting } from '../src/db/repository.js';
 import { responsePlugin } from '../src/routes/helpers.js';
 import { interpretRoutes } from '../src/routes/interpret.js';
 import type { Item } from '@shared/types';
 
 function makeItem(id: string): Item {
   const now = new Date().toISOString();
   return {
     id, source_type: 'github', source_id: id,
     url: `https://github.com/${id}`, title: `Project ${id}`,
     title_zh: null, summary: `Desc ${id}`, lang: 'en',
     item_type: 'project', raw_data: '{}', stars: 100,
     stars_prev: null, forks: 10, author: 'owner',
     pushed_at: now, score: 80,
     score_detail: { star_velocity: 0.5, activity: 0.6, fork_ratio: 0.7, author_reputation: 0.4, issue_health: 0.8 },
     status: 'scored', is_read: 0, is_favorited: 0,
     collected_at: now, created_at: now, updated_at: now,
     interpreted_at: null,
   };
 }
 
 function setApiKey(key: string): void {
   const settings = {
     github_token: '', fetch_interval_hours: 6, topic_words: [],
     score_weights: { star_velocity: 0.35, activity: 0.25, fork_ratio: 0.15, author_reputation: 0.15, issue_health: 0.10 },
     score_threshold: 20,
     llm_api_key: key,
     llm_base_url: 'https://open.bigmodel.cn/api/paas/v4',
     llm_model: 'glm-4-plus',
     llm_timeout_ms: 30000,
   };
   setSetting('all_settings_json', JSON.stringify(settings));
 }
 
 function mockFetchSuccess(titleZh: string, summary: string): void {
   vi.spyOn(globalThis, 'fetch').mockResolvedValue({
     ok: true, status: 200,
     json: async () => ({ choices: [{ message: { content: JSON.stringify({ title_zh: titleZh, summary }) } }] }),
   } as Response);
 }
 
 async function buildApp() {
   const app = Fastify();
   await app.register(responsePlugin);
   await app.register(interpretRoutes);
   return app;
 }
 
 describe('Interpret Routes', () => {
   let app: Awaited<ReturnType<typeof buildApp>>;
 
   beforeEach(async () => {
     process.env.AIRADAR_DB_PATH = ':memory:';
     const db = openDb();
     initSchema(db);
     runMigrations(db);
     app = await buildApp();
   });
 
   afterEach(async () => {
     vi.restoreAllMocks();
     await app.close();
     closeDb();
   });
 
   it('POST /api/interpret/run should return LLM_NOT_CONFIGURED when no API key', async () => {
     upsertItem(makeItem('test-1'));
     const resp = await app.inject({ method: 'POST', url: '/api/interpret/run' });
     const body = JSON.parse(resp.body);
     expect(body.ok).toBe(false);
     expect(body.error.code).toBe('LLM_NOT_CONFIGURED');
     expect(resp.statusCode).toBe(400);
   });
 
   it('POST /api/interpret/run should interpret items when API key is set', async () => {
     setApiKey('test-key');
     upsertItem(makeItem('item-1'));
     mockFetchSuccess('\u9879\u76ee', '\u6458\u8981');
 
     const resp = await app.inject({ method: 'POST', url: '/api/interpret/run' });
     const body = JSON.parse(resp.body);
     expect(body.ok).toBe(true);
     expect(body.data.total).toBe(1);
     expect(body.data.succeeded).toBe(1);
   });
 
   it('POST /api/interpret/:id should interpret a single item', async () => {
     setApiKey('test-key');
     upsertItem(makeItem('single-1'));
     mockFetchSuccess('\u5355\u4e2a\u9879\u76ee', '\u5355\u4e2a\u6458\u8981');
 
     const resp = await app.inject({ method: 'POST', url: '/api/interpret/single-1' });
     const body = JSON.parse(resp.body);
     expect(body.ok).toBe(true);
     expect(body.data.title_zh).toBe('\u5355\u4e2a\u9879\u76ee');
   });
 
   it('POST /api/interpret/:id should return NOT_FOUND for missing item', async () => {
     setApiKey('test-key');
     const resp = await app.inject({ method: 'POST', url: '/api/interpret/nonexistent' });
     const body = JSON.parse(resp.body);
     expect(body.ok).toBe(false);
     expect(body.error.code).toBe('NOT_FOUND');
     expect(resp.statusCode).toBe(404);
   });
 
   it('POST /api/interpret/:id should return LLM_NOT_CONFIGURED when no API key', async () => {
     upsertItem(makeItem('test-2'));
     const resp = await app.inject({ method: 'POST', url: '/api/interpret/test-2' });
     const body = JSON.parse(resp.body);
     expect(body.ok).toBe(false);
     expect(body.error.code).toBe('LLM_NOT_CONFIGURED');
   });
 });
