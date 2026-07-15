import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDb, closeDb } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { runMigrations } from '../src/db/migrations.js';
import { queryFeed, getItemById, getItemCount, upsertItem } from '../src/db/repository.js';
import { scoreItems } from '../src/scorer/index.js';
import { dedup } from '../src/collectors/dedup.js';
import { fetchWithRetry, isAllowedDomain } from '../src/lib/http.js';
import type { RawItem } from '../src/collectors/types.js';
import type { Item, ScoreDetail } from '@shared/types';

function makeRaw(overrides: Partial<RawItem> = {}): RawItem {
  return {
    source_type: 'github',
    source_id: 'owner/repo',
    url: 'https://github.com/owner/repo',
    title: 'AI Agent Framework',
    summary: 'A framework',
    lang: 'en',
    item_type: 'project',
    raw_data: '{}',
    stars: 1000,
    forks: 100,
    author: 'owner',
    pushed_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Integration: Full collect -> score -> feed', () => {
  beforeEach(() => {
    process.env.AIRADAR_DB_PATH = ':memory:';
    const db = openDb();
    initSchema(db);
    runMigrations(db);
  });
  afterEach(() => closeDb());

  it('should simulate full pipeline: raw -> dedup -> score -> insert -> feed query', () => {
    const raws: RawItem[] = [
      makeRaw({ source_id: 'a/repo', url: 'https://github.com/a/repo', title: 'High Star', stars: 50000, forks: 500 }),
      makeRaw({ source_id: 'b/repo', url: 'https://github.com/b/repo', title: 'Low Star', stars: 50, forks: 5 }),
      makeRaw({ source_id: 'a/repo', url: 'https://github.com/a/repo', title: 'Dup', stars: 30 }),
      makeRaw({ source_id: 'c/news', url: 'https://hn.com/123', title: 'HN Story', stars: 200, source_type: 'hackernews', item_type: 'news' }),
    ];

    const deduped = dedup(raws);
    expect(deduped.length).toBe(3);

    const scored = scoreItems(deduped.map((r) => ({
      stars: r.stars, stars_prev: null, forks: r.forks,
      pushed_at: r.pushed_at, collected_at: new Date().toISOString(),
    })));

    const now = new Date().toISOString();
    for (let i = 0; i < deduped.length; i++) {
      const r = deduped[i];
      const item: Item = {
        id: `${r.source_type}:${r.source_id}`,
        source_type: r.source_type, source_id: r.source_id,
        url: r.url, title: r.title, title_zh: null,
        summary: r.summary, lang: r.lang, item_type: r.item_type as Item['item_type'],
        raw_data: r.raw_data, stars: r.stars, stars_prev: null,
        forks: r.forks, author: r.author, pushed_at: r.pushed_at,
        score: scored[i].score, score_detail: scored[i].detail as ScoreDetail,
        status: 'scored', is_read: 0, is_favorited: 0,
        collected_at: now, created_at: now, updated_at: now,
      };
      upsertItem(item);
    }

    expect(getItemCount()).toBe(3);

    const feed = queryFeed({ sort: 'score' });
    expect(feed.items.length).toBe(3);
    expect(feed.items[0].score).toBeGreaterThanOrEqual(feed.items[1].score);

    const detail = getItemById('github:a/repo');
    expect(detail).not.toBeNull();
    expect(detail!.stars).toBe(50000);
  });

  it('should exclude hidden items from feed', () => {
    const now = new Date().toISOString();
    upsertItem({
      id: 'x', source_type: 'github', source_id: 'x/y', url: 'https://github.com/x/y',
      title: 'Hidden', title_zh: null, summary: null, lang: 'en', item_type: 'project',
      raw_data: '{}', stars: 5, stars_prev: null, forks: 1, author: 'x',
      pushed_at: now, score: 10, score_detail: null, status: 'hidden',
      is_read: 0, is_favorited: 0, collected_at: now, created_at: now, updated_at: now,
    } as Item);
    upsertItem({
      id: 'y', source_type: 'github', source_id: 'y/z', url: 'https://github.com/y/z',
      title: 'Visible', title_zh: null, summary: null, lang: 'en', item_type: 'project',
      raw_data: '{}', stars: 500, stars_prev: null, forks: 50, author: 'y',
      pushed_at: now, score: 70, score_detail: null, status: 'scored',
      is_read: 0, is_favorited: 0, collected_at: now, created_at: now, updated_at: now,
    } as Item);

    const feed = queryFeed({});
    expect(feed.items.length).toBe(1);
    expect(feed.items[0].title).toBe('Visible');
  });
});

describe('Integration: Weight change -> rescore -> order changes', () => {
  beforeEach(() => {
    process.env.AIRADAR_DB_PATH = ':memory:';
    const db = openDb();
    initSchema(db);
    runMigrations(db);
  });
  afterEach(() => closeDb());

  it('should produce different rankings when weights change', () => {
    const items = [
      { stars: 50000, stars_prev: null, forks: 1000, pushed_at: new Date(Date.now() - 5*86400000).toISOString(), collected_at: new Date().toISOString() },
      { stars: 1000, stars_prev: null, forks: 100, pushed_at: new Date().toISOString(), collected_at: new Date().toISOString() },
    ];

    const velocityHeavy = scoreItems(items, { star_velocity: 1, activity: 0, fork_ratio: 0, author_reputation: 0, issue_health: 0 });
    const activityHeavy = scoreItems(items, { star_velocity: 0, activity: 1, fork_ratio: 0, author_reputation: 0, issue_health: 0 });

    expect(velocityHeavy[0].score).toBeGreaterThanOrEqual(velocityHeavy[1].score);
    expect(activityHeavy[1].score).toBeGreaterThan(activityHeavy[0].score);
  });
});

describe('Integration: Rate limit graceful degradation', () => {
  beforeEach(() => {
    process.env.AIRADAR_DB_PATH = ':memory:';
    const db = openDb();
    initSchema(db);
    runMigrations(db);
  });
  afterEach(() => {
    closeDb();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should reject with error on 429 (rate limited)', async () => {
    expect(isAllowedDomain('https://api.github.com/search/repositories')).toBe(true);
    expect(isAllowedDomain('https://evil.com/hack')).toBe(false);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('rate limited', { status: 429 })
    ));

    await expect(
      fetchWithRetry('https://api.github.com/test', { source: 'github', retries: 1 })
    ).rejects.toThrow();
  });

  it('should not crash when network fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      fetchWithRetry('https://hn.algolia.com/api/v1/search', { source: 'hackernews', retries: 1 })
    ).rejects.toThrow();

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
