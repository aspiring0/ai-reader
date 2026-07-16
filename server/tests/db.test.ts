import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, closeDb } from '../src/db/connection.js';
import { initSchema, getSchemaVersion } from '../src/db/schema.js';
import { runMigrations } from '../src/db/migrations.js';
import {
  upsertItem,
  getItemById,
  queryFeed,
  getItemCount,
  getSetting,
  setSetting,
  getAllSettings,
  upsertSyncState,
  getSyncState,
  getAllSyncState,
  insertLog,
  queryLogs,
  getAuthorCache,
  setAuthorCache,
  insertInstalledSkill,
  queryInstalledSkills,
  deleteInstalledSkill,
  getInstalledSkill,
} from '../src/db/repository.js';
import type { Item, FeedQuery } from '@shared/types';

function makeItem(overrides: Partial<Item> = {}): Item {
  const now = new Date().toISOString();
  return {
    id: 'test-1',
    source_type: 'github',
    source_id: 'owner/repo',
    url: 'https://github.com/owner/repo',
    title: 'Test Project',
    title_zh: null,
    summary: 'A test project',
    lang: 'en',
    item_type: 'project',
    raw_data: '{}',
    stars: 100,
    stars_prev: null,
    forks: 10,
    author: 'owner',
    pushed_at: now,
    score: 50,
    score_detail: { star_velocity: 0.5, activity: 0.6, fork_ratio: 0.7, author_reputation: 0.4, issue_health: 0.8 },
    status: 'scored',
    is_read: 0,
    is_favorited: 0,
    collected_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('DB Layer', () => {
  beforeEach(() => {
    // Use in-memory DB for each test
    process.env.AIRADAR_DB_PATH = ':memory:';
    const db = openDb();
    initSchema(db);
    runMigrations(db);
  });

  afterEach(() => {
    closeDb();
  });

  describe('Schema and Migrations', () => {
    it('should create all tables', () => {
      const db = openDb();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toContain('items');
      expect(names).toContain('settings');
      expect(names).toContain('sync_state');
      expect(names).toContain('logs');
      expect(names).toContain('author_cache');
      expect(names).toContain('schema_version');
    });

    it('should have schema version after migration', () => {
      const version = getSchemaVersion();
      expect(version).toBeGreaterThan(0);
    });
  });

  describe('Item CRUD', () => {
    it('should insert a new item', () => {
      const item = makeItem();
      upsertItem(item);
      const fetched = getItemById('test-1');
      expect(fetched).not.toBeNull();
      expect(fetched!.title).toBe('Test Project');
      expect(fetched!.stars).toBe(100);
    });

    it('should upsert (update existing) on conflict', () => {
      const item = makeItem();
      upsertItem(item);
      const updated = { ...item, stars: 200, stars_prev: 100 };
      upsertItem(updated);
      const fetched = getItemById('test-1');
      expect(fetched!.stars).toBe(200);
      expect(fetched!.stars_prev).toBe(100);
    });

    it('should return null for non-existent item', () => {
      const fetched = getItemById('does-not-exist');
      expect(fetched).toBeNull();
    });
  });

  describe('Feed Query', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        upsertItem(
          makeItem({
            id: `item-${i}`,
            source_id: `owner/repo-${i}`,
            title: `Project ${i}`,
            score: i * 10,
            stars: i * 50,
            status: i === 5 ? 'hidden' : 'scored',
            source_type: i <= 2 ? 'github' : 'rss',
          })
        );
      }
    });

    it('should paginate results', () => {
      const result = queryFeed({ page: 1, limit: 2 } as FeedQuery);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(4); // 4 scored, 1 hidden excluded
    });

    it('should sort by score descending by default', () => {
      const result = queryFeed({} as FeedQuery);
      expect(result.items[0].score).toBeGreaterThanOrEqual(result.items[1].score);
    });

    it('should filter by source_type', () => {
      const result = queryFeed({ source: 'github' } as FeedQuery);
      expect(result.items.every((i) => i.source_type === 'github')).toBe(true);
      expect(result.items.length).toBe(2);
    });

    it('should filter by score_min', () => {
      const result = queryFeed({ score_min: 30 } as FeedQuery);
      expect(result.items.every((i) => i.score >= 30)).toBe(true);
    });

    it('should search by title', () => {
      const result = queryFeed({ q: 'Project 3' } as FeedQuery);
      expect(result.items.length).toBe(1);
      expect(result.items[0].title).toBe('Project 3');
    });

    it('should exclude hidden items', () => {
      const result = queryFeed({} as FeedQuery);
      expect(result.items.every((i) => i.status !== 'hidden')).toBe(true);
    });
  });

  describe('getItemCount', () => {
    it('should count all items', () => {
      upsertItem(makeItem({ id: 'a' }));
      upsertItem(makeItem({ id: 'b', source_id: 'other/repo' }));
      expect(getItemCount()).toBe(2);
    });
  });

  describe('Settings', () => {
    it('should set and get a setting', () => {
      setSetting('github_token', 'my-token');
      expect(getSetting('github_token')).toBe('my-token');
    });

    it('should return empty string for missing key', () => {
      expect(getSetting('nonexistent')).toBe('');
    });

    it('should get all settings as object', () => {
      setSetting('fetch_interval_hours', '6');
      const all = getAllSettings();
      expect(all['fetch_interval_hours']).toBe('6');
    });
  });

  describe('SyncState', () => {
    it('should upsert and get sync state', () => {
      upsertSyncState('github', {
        source: 'github',
        last_run: '2026-01-01T00:00:00Z',
        last_success: '2026-01-01T00:00:00Z',
        item_count: 10,
        error: null,
      });
      const state = getSyncState('github');
      expect(state).not.toBeNull();
      expect(state!.item_count).toBe(10);
    });

    it('should get all sync states', () => {
      upsertSyncState('github', {
        source: 'github',
        last_run: '2026-01-01',
        last_success: '2026-01-01',
        item_count: 5,
        error: null,
      });
      upsertSyncState('rss', {
        source: 'rss',
        last_run: '2026-01-02',
        last_success: null,
        item_count: 3,
        error: 'timeout',
      });
      const all = getAllSyncState();
      expect(all).toHaveLength(2);
    });
  });

  describe('Logs', () => {
    it('should insert and query logs', () => {
      insertLog({
        ts: '2026-01-01T00:00:00Z',
        level: 'info',
        category: 'collect',
        action: 'github_fetch',
        target: 'api.github.com',
        message: 'Fetched 30 items',
        duration_ms: 1200,
      });
      const logs = queryLogs({ limit: 10 });
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Fetched 30 items');
    });

    it('should filter logs by category', () => {
      insertLog({
        ts: '2026-01-01T00:00:00Z',
        level: 'info',
        category: 'collect',
        action: 'test',
        target: null,
        message: 'collect log',
        duration_ms: null,
      });
      insertLog({
        ts: '2026-01-01T00:00:00Z',
        level: 'error',
        category: 'api',
        action: 'test',
        target: null,
        message: 'api log',
        duration_ms: null,
      });
      const collectLogs = queryLogs({ category: 'collect' });
      expect(collectLogs).toHaveLength(1);
      expect(collectLogs[0].category).toBe('collect');
    });
  });

  describe('AuthorCache', () => {
    it('should set and get author cache', () => {
      setAuthorCache({
        author: 'openai',
        max_stars: 50000,
        repo_count: 30,
        fetched_at: '2026-01-01T00:00:00Z',
      });
      const cached = getAuthorCache('openai');
      expect(cached).not.toBeNull();
      expect(cached!.max_stars).toBe(50000);
    });

    it('should return null for uncached author', () => {
      expect(getAuthorCache('unknown')).toBeNull();
    });
  });

  describe('InstalledSkills (SP3)', () => {
    it('should insert and query an installed skill', () => {
      insertInstalledSkill({
        item_id: 'github:owner/repo',
        skill_name: 'my-skill',
        skill_path: '/home/.codex/skills/my-skill',
        install_method: 'api',
        scan_level: 'green',
      });
      const all = queryInstalledSkills();
      expect(all).toHaveLength(1);
      expect(all[0].skill_name).toBe('my-skill');
      expect(all[0].scan_level).toBe('green');
    });

    it('should enforce UNIQUE on skill_name (upsert)', () => {
      insertInstalledSkill({ item_id: 'a', skill_name: 'dup', skill_path: '/p1' });
      insertInstalledSkill({ item_id: 'b', skill_name: 'dup', skill_path: '/p2' });
      const all = queryInstalledSkills();
      expect(all.filter((s) => s.skill_name === 'dup')).toHaveLength(1);
      expect(all[0].skill_path).toBe('/p2');
    });

    it('should get a single installed skill by name', () => {
      insertInstalledSkill({ item_id: 'c', skill_name: 'findme', skill_path: '/p3' });
      const skill = getInstalledSkill('findme');
      expect(skill).not.toBeNull();
      expect(skill!.item_id).toBe('c');
    });

    it('should delete an installed skill', () => {
      insertInstalledSkill({ item_id: 'd', skill_name: 'deleteme', skill_path: '/p4' });
      expect(deleteInstalledSkill('deleteme')).toBe(true);
      expect(getInstalledSkill('deleteme')).toBeNull();
      expect(deleteInstalledSkill('nonexistent')).toBe(false);
    });
  });
});
import type { FeedQuery as _FQ } from '@shared/types';
