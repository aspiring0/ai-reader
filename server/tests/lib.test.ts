import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, closeDb } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { runMigrations } from '../src/db/migrations.js';
import { logger, getLogs } from '../src/lib/logger.js';
import { getSettings, updateSettings } from '../src/lib/config.js';

describe('Lib: Logger', () => {
  beforeEach(() => {
    process.env.AIRADAR_DB_PATH = ':memory:';
    const db = openDb();
    initSchema(db);
    runMigrations(db);
  });

  afterEach(() => {
    closeDb();
  });

  it('should log and retrieve info entries', () => {
    logger.info('collect', 'github', 'Fetched 30 items', { durationMs: 500 });
    const logs = getLogs({});
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('info');
    expect(logs[0].category).toBe('collect');
    expect(logs[0].duration_ms).toBe(500);
  });

  it('should log and retrieve error entries', () => {
    logger.error('system', 'startup', 'Something broke');
    const logs = getLogs({ level: 'error' });
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe('Something broke');
  });

  it('should filter by category', () => {
    logger.info('collect', 'test', 'collect log');
    logger.info('api', 'test', 'api log');
    const collectLogs = getLogs({ category: 'collect' });
    expect(collectLogs).toHaveLength(1);
    expect(collectLogs[0].category).toBe('collect');
  });

  it('should respect limit', () => {
    for (let i = 0; i < 5; i++) {
      logger.info('system', 'test', `log ${i}`);
    }
    const logs = getLogs({ limit: 3 });
    expect(logs).toHaveLength(3);
  });
});

describe('Lib: Config', () => {
  beforeEach(() => {
    process.env.AIRADAR_DB_PATH = ':memory:';
    const db = openDb();
    initSchema(db);
    runMigrations(db);
  });

  afterEach(() => {
    closeDb();
  });

  it('should return default settings on fresh DB', () => {
    const settings = getSettings();
    expect(settings.fetch_interval_hours).toBe(6);
    expect(settings.score_weights.star_velocity).toBe(0.35);
  });

  it('should update settings', () => {
    updateSettings({ github_token: 'my-token' });
    const settings = getSettings();
    expect(settings.github_token).toBe('my-token');
  });

  it('should deep merge score_weights', () => {
    updateSettings({ score_weights: { star_velocity: 0.5 } });
    const settings = getSettings();
    expect(settings.score_weights.star_velocity).toBe(0.5);
    expect(settings.score_weights.activity).toBe(0.25); // unchanged
  });
});
