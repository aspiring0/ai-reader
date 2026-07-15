import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { openDb, closeDb } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { runMigrations } from '../src/db/migrations.js';
import { upsertItem, setSetting } from '../src/db/repository.js';
import { responsePlugin } from '../src/routes/helpers.js';
import { feedRoutes } from '../src/routes/feed.js';
import { settingsRoutes } from '../src/routes/settings.js';
import { healthRoutes } from '../src/routes/health.js';
import { logsRoutes } from '../src/routes/logs.js';
import { logger } from '../src/lib/logger.js';
import type { Item } from '@shared/types';

function makeItem(overrides: Partial<Item> = {}): Item {
  const now = new Date().toISOString();
  return {
    id: 'test-1', source_type: 'github', source_id: 'owner/repo',
    url: 'https://github.com/owner/repo', title: 'Test Project',
    title_zh: null, summary: 'A test project', lang: 'en',
    item_type: 'project', raw_data: '{}', stars: 100,
    stars_prev: null, forks: 10, author: 'owner',
    pushed_at: now, score: 50,
    score_detail: { star_velocity: 0.5, activity: 0.6, fork_ratio: 0.7, author_reputation: 0.4, issue_health: 0.8 },
    status: 'scored', is_read: 0, is_favorited: 0,
    collected_at: now, created_at: now, updated_at: now,
    ...overrides,
  };
}

async function buildApp() {
  const app = Fastify();
  await app.register(responsePlugin);
  await app.register(feedRoutes);
  await app.register(settingsRoutes);
  await app.register(healthRoutes);
  await app.register(logsRoutes);
  return app;
}

describe('API Routes', () => {
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

  describe('GET /api/feed', () => {
    it('should return paginated list', async () => {
      for (let i = 1; i <= 3; i++) {
        upsertItem(makeItem({ id: `item-${i}`, source_id: `o/r${i}`, title: `Project ${i}`, score: i * 10 }));
      }
      const resp = await app.inject({ method: 'GET', url: '/api/feed' });
      expect(resp.statusCode).toBe(200);
      const body = resp.json();
      expect(body.ok).toBe(true);
      expect(body.data.items).toHaveLength(3);
      expect(body.data.total).toBe(3);
    });

    it('should filter by score_min', async () => {
      upsertItem(makeItem({ id: 'a', source_id: 'a/r', score: 10 }));
      upsertItem(makeItem({ id: 'b', source_id: 'b/r', score: 50 }));
      const resp = await app.inject({ method: 'GET', url: '/api/feed?score_min=30' });
      const body = resp.json();
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].score).toBe(50);
    });

    it('should search by title', async () => {
      upsertItem(makeItem({ id: 'a', source_id: 'a/r', title: 'AI Agent' }));
      upsertItem(makeItem({ id: 'b', source_id: 'b/r', title: 'Other Project' }));
      const resp = await app.inject({ method: 'GET', url: '/api/feed?q=Agent' });
      const body = resp.json();
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].title).toBe('AI Agent');
    });

    it('should sort by recent', async () => {
      const old = new Date('2025-01-01').toISOString();
      const newer = new Date('2026-06-01').toISOString();
      upsertItem(makeItem({ id: 'old', source_id: 'o/r1', updated_at: old, title: 'Old' }));
      upsertItem(makeItem({ id: 'new', source_id: 'o/r2', updated_at: newer, title: 'New' }));
      const resp = await app.inject({ method: 'GET', url: '/api/feed?sort=recent' });
      const body = resp.json();
      expect(body.data.items[0].title).toBe('New');
    });
  });

  describe('GET /api/feed/:id', () => {
    it('should return item by id', async () => {
      upsertItem(makeItem({ id: 'xyz' }));
      const resp = await app.inject({ method: 'GET', url: '/api/feed/xyz' });
      expect(resp.statusCode).toBe(200);
      expect(resp.json().data.title).toBe('Test Project');
    });

    it('should return 404 for missing item', async () => {
      const resp = await app.inject({ method: 'GET', url: '/api/feed/nope' });
      expect(resp.statusCode).toBe(404);
      expect(resp.json().ok).toBe(false);
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const resp = await app.inject({ method: 'GET', url: '/api/health' });
      const body = resp.json();
      expect(body.ok).toBe(true);
      expect(body.data.db_items).toBe(0);
      expect(body.data.github_token).toBe(false);
    });

    it('should reflect items in DB', async () => {
      upsertItem(makeItem({ id: 'a' }));
      upsertItem(makeItem({ id: 'b', source_id: 'other/r' }));
      const resp = await app.inject({ method: 'GET', url: '/api/health' });
      expect(resp.json().data.db_items).toBe(2);
    });
  });

  describe('GET/PUT /api/settings', () => {
    it('should return default settings', async () => {
      const resp = await app.inject({ method: 'GET', url: '/api/settings' });
      const body = resp.json();
      expect(body.data.fetch_interval_hours).toBe(6);
    });

    it('should update settings', async () => {
      const resp = await app.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: { github_token: 'test-token' },
      });
      const body = resp.json();
      expect(body.ok).toBe(true);
      // Token should be masked in response
      expect(body.data.github_token).toBe('***');
    });
  });

  describe('GET /api/logs', () => {
    it('should return logs', async () => {
      logger.info('collect', 'test', 'test log');
      const resp = await app.inject({ method: 'GET', url: '/api/logs' });
      const body = resp.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].message).toBe('test log');
    });

    it('should filter by level', async () => {
      logger.info('collect', 'test', 'info log');
      logger.error('system', 'test', 'error log');
      const resp = await app.inject({ method: 'GET', url: '/api/logs?level=error' });
      const body = resp.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].level).toBe('error');
    });
  });
});
