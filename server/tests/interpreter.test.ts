 import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
 import { openDb, closeDb } from '../src/db/connection.js';
 import { initSchema } from '../src/db/schema.js';
 import { runMigrations } from '../src/db/migrations.js';
 import { upsertItem, getItemById, updateItemFields } from '../src/db/repository.js';
 import { setSetting } from '../src/db/repository.js';
 import { runInterpretation, interpretSingle } from '../src/interpreter/index.js';
 import type { Item } from '@shared/types';
 
 function makeItem(id: string, overrides: Partial<Item> = {}): Item {
   const now = new Date().toISOString();
   return {
     id,
     source_type: 'github',
     source_id: id,
     url: `https://github.com/${id}`,
     title: `Project ${id}`,
     title_zh: null,
     summary: `Description for ${id}`,
     lang: 'en',
     item_type: 'project',
     raw_data: '{}',
     stars: 100,
     stars_prev: null,
     forks: 10,
     author: 'owner',
     pushed_at: now,
     score: 80,
     score_detail: { star_velocity: 0.5, activity: 0.6, fork_ratio: 0.7, author_reputation: 0.4, issue_health: 0.8 },
     status: 'scored',
     is_read: 0,
     is_favorited: 0,
     collected_at: now,
     created_at: now,
     updated_at: now,
     interpreted_at: null,
     ...overrides,
   };
 }
 
 function setApiKey(key: string): void {
   const settings = {
     github_token: '',
     fetch_interval_hours: 6,
     topic_words: [],
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
     ok: true,
     status: 200,
     json: async () => ({
       choices: [{ message: { content: JSON.stringify({ title_zh: titleZh, summary }) } }],
     }),
   } as Response);
 }
 
 describe('Interpreter Module', () => {
   beforeEach(() => {
     process.env.AIRADAR_DB_PATH = ':memory:';
     const db = openDb();
     initSchema(db);
     runMigrations(db);
   });
 
   afterEach(() => {
     vi.restoreAllMocks();
     closeDb();
   });
 
   it('should skip interpretation when API key is empty', async () => {
     upsertItem(makeItem('test-1'));
     const result = await runInterpretation();
     expect(result.total).toBe(0);
     expect(result.succeeded).toBe(0);
 
     const item = getItemById('test-1');
     expect(item?.title_zh).toBeNull();
     expect(item?.interpreted_at).toBeNull();
   });
 
   it('should interpret a batch of items and write to DB', async () => {
     setApiKey('test-key');
     upsertItem(makeItem('proj-1'));
     upsertItem(makeItem('proj-2'));
     mockFetchSuccess('\u9879\u76ee1', '\u6458\u89811');
 
     const result = await runInterpretation();
     expect(result.total).toBe(2);
     expect(result.succeeded).toBe(2);
     expect(result.failed).toBe(0);
 
     const item1 = getItemById('proj-1');
     expect(item1?.title_zh).toBe('\u9879\u76ee1');
     expect(item1?.summary).toBe('\u6458\u89811');
     expect(item1?.interpreted_at).not.toBeNull();
 
     const item2 = getItemById('proj-2');
     expect(item2?.title_zh).toBe('\u9879\u76ee1');
     expect(item2?.interpreted_at).not.toBeNull();
   });
 
   it('should continue batch when one item fails', async () => {
     setApiKey('test-key');
     upsertItem(makeItem('fail-item'));
     upsertItem(makeItem('ok-item'));
 
     const fetchMock = vi.spyOn(globalThis, 'fetch')
       .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
       .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
       .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
       .mockResolvedValue({
         ok: true,
         status: 200,
         json: async () => ({ choices: [{ message: { content: '{"title_zh": "OK", "summary": "ok"}' } }] }),
       } as Response);
 
     const result = await runInterpretation();
     expect(result.succeeded).toBe(1);
     expect(result.failed).toBe(1);
     expect(result.errors.length).toBeGreaterThan(0);
 
     const failed = getItemById('fail-item');
     expect(failed?.interpreted_at).toBeNull();
 
     const ok = getItemById('ok-item');
     expect(ok?.interpreted_at).not.toBeNull();
 
     // Verify fetch was called for both items (fail-item gets retried, ok-item succeeds)
     expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
   });
 
   it('should respect limit parameter', async () => {
     setApiKey('test-key');
     for (let i = 0; i < 5; i++) {
       upsertItem(makeItem(`item-${i}`));
     }
     mockFetchSuccess('T', 'S');
 
     const result = await runInterpretation(2);
     expect(result.total).toBe(2);
   });
 
   it('should not re-interpret already-interpreted items', async () => {
     setApiKey('test-key');
     const item = makeItem('done-1');
     upsertItem(item);
     updateItemFields('done-1', {
       title_zh: '\u5df2\u7ffb\u8bd1',
       summary: '\u5df2\u7ffb\u8bd1\u6458\u8981',
       interpreted_at: new Date().toISOString(),
     });
     mockFetchSuccess('NEW', 'NEW');
 
     const result = await runInterpretation();
     expect(result.total).toBe(0);
 
     const dbItem = getItemById('done-1');
     expect(dbItem?.title_zh).toBe('\u5df2\u7ffb\u8bd1');
   });
 
   it('should interpret a single item by id', async () => {
     setApiKey('test-key');
     upsertItem(makeItem('single-1'));
     mockFetchSuccess('\u5355\u4e2a', '\u5355\u4e2a\u6458\u8981');
 
     const result = await interpretSingle('single-1');
     expect(result.title_zh).toBe('\u5355\u4e2a');
     expect(result.summary).toBe('\u5355\u4e2a\u6458\u8981');
 
     const item = getItemById('single-1');
     expect(item?.interpreted_at).not.toBeNull();
   });
 
   it('should throw for non-existent item in interpretSingle', async () => {
     setApiKey('test-key');
     await expect(interpretSingle('nonexistent')).rejects.toThrow();
   });
 });
