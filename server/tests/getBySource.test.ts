import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, closeDb } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { runMigrations } from '../src/db/migrations.js';
import { getItemBySource, upsertItem } from '../src/db/repository.js';
import type { Item } from '@shared/types';

function makeItem(overrides: Partial<Item> = {}): Item {
  const now = new Date().toISOString();
  return {
    id: 'test-1', source_type: 'github', source_id: 'owner/repo',
    url: 'https://github.com/owner/repo', title: 'Test', title_zh: null,
    summary: null, lang: 'en', item_type: 'project', raw_data: '{}',
    stars: 100, stars_prev: null, forks: 10, author: 'owner',
    pushed_at: now, score: 50, score_detail: null, status: 'scored',
    is_read: 0, is_favorited: 0, collected_at: now,
    created_at: now, updated_at: now, ...overrides,
  };
}

describe('getItemBySource', () => {
  beforeEach(() => {
    process.env.AIRADAR_DB_PATH = ':memory:';
    const db = openDb();
    initSchema(db);
    runMigrations(db);
  });
  afterEach(() => closeDb());

  it('should find item by source_type + source_id', () => {
    upsertItem(makeItem({ source_type: 'github', source_id: 'openai/codex', stars: 500 }));
    const found = getItemBySource('github', 'openai/codex');
    expect(found).not.toBeNull();
    expect(found!.stars).toBe(500);
  });

  it('should return null when not found', () => {
    expect(getItemBySource('github', 'nope/missing')).toBeNull();
  });

  it('should find different sources independently', () => {
    upsertItem(makeItem({ id: 'a', source_type: 'github', source_id: 'x/y' }));
    upsertItem(makeItem({ id: 'b', source_type: 'rss', source_id: 'x/y' }));
    expect(getItemBySource('github', 'x/y')!.id).toBe('a');
    expect(getItemBySource('rss', 'x/y')!.id).toBe('b');
  });
});
