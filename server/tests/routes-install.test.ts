import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { openDb, closeDb } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { runMigrations } from '../src/db/migrations.js';
import { upsertItem, insertInstalledSkill } from '../src/db/repository.js';
import { responsePlugin } from '../src/routes/helpers.js';
import { installRoutes } from '../src/routes/install.js';
import type { Item } from '@shared/types';

import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

function makeItem(overrides: Partial<Item> = {}): Item {
  const now = new Date().toISOString();
  return {
    id: 'github:o/r', source_type: 'github', source_id: 'o/r',
    url: 'https://github.com/o/r', title: 'o/r', title_zh: null,
    summary: 'A skill', lang: 'en', item_type: 'skill',
    raw_data: '{"topics":["codex-skill"]}', stars: 100,
    stars_prev: null, forks: 10, author: 'o',
    pushed_at: now, score: 50,
    score_detail: { star_velocity: 0.5, activity: 0.6, fork_ratio: 0.7, author_reputation: 0.4, issue_health: 0.8 },
    status: 'scored', is_read: 0, is_favorited: 0,
    collected_at: now, created_at: now, updated_at: now, interpreted_at: null,
    ...overrides,
  };
}

async function buildApp() {
  const app = Fastify();
  await app.register(responsePlugin);
  await app.register(installRoutes);
  return app;
}

describe('Install API Routes', () => {
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

  describe('GET /api/install/status', () => {
    it('should return empty list when nothing installed', async () => {
      const resp = await app.inject({ method: 'GET', url: '/api/install/status' });
      expect(resp.statusCode).toBe(200);
      const body = JSON.parse(resp.body);
      expect(body.ok).toBe(true);
      expect(body.data.installed).toEqual([]);
    });

    it('should list installed skills', async () => {
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
      process.env.CODEX_HOME = tmpHome;
      const skillPath = path.join(tmpHome, 'skills', 'my-skill');
      insertInstalledSkill({ item_id: 'github:o/r', skill_name: 'my-skill', skill_path: skillPath, install_method: 'api', scan_level: 'green' });
      const resp = await app.inject({ method: 'GET', url: '/api/install/status' });
      const body = JSON.parse(resp.body);
      expect(body.data.installed).toHaveLength(1);
      expect(body.data.installed[0].skill_name).toBe('my-skill');
      fs.rmSync(tmpHome, { recursive: true, force: true });
      delete process.env.CODEX_HOME;
    });
  });

  describe('DELETE /api/install/:skillName', () => {
    it('should delete an installed skill', async () => {
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
      process.env.CODEX_HOME = tmpHome;
      const skillPath = path.join(tmpHome, 'skills', 'rm-me');
      fs.mkdirSync(skillPath, { recursive: true });
      insertInstalledSkill({ item_id: 'github:o/r', skill_name: 'rm-me', skill_path: skillPath });
      const resp = await app.inject({ method: 'DELETE', url: '/api/install/rm-me' });
      expect(resp.statusCode).toBe(200);
      const body = JSON.parse(resp.body);
      expect(body.ok).toBe(true);
      fs.rmSync(tmpHome, { recursive: true, force: true });
      delete process.env.CODEX_HOME;
    });

    it('should return 404 for unknown skill', async () => {
      const resp = await app.inject({ method: 'DELETE', url: '/api/install/nonexistent' });
      expect(resp.statusCode).toBe(404);
    });
  });

  describe('POST /api/install/check/:itemId', () => {
    it('should return 404 for unknown item', async () => {
      const resp = await app.inject({ method: 'POST', url: '/api/install/check/github:unknown/r' });
      expect(resp.statusCode).toBe(404);
    });
  });
});
