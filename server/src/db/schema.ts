import type { DatabaseSync } from 'node:sqlite';
import { openDb } from './connection.js';

const DDL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  title_zh TEXT,
  summary TEXT,
  lang TEXT DEFAULT 'en',
  item_type TEXT DEFAULT 'project',
  raw_data TEXT,
  stars INTEGER DEFAULT 0,
  stars_prev INTEGER,
  forks INTEGER DEFAULT 0,
  author TEXT,
  pushed_at TEXT,
  score INTEGER DEFAULT 0,
  score_detail TEXT,
  status TEXT DEFAULT 'candidate',
  is_read INTEGER DEFAULT 0,
  is_favorited INTEGER DEFAULT 0,
  collected_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_feed ON items(status, score DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_search ON items(title, summary);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  source TEXT PRIMARY KEY,
  last_run TEXT,
  last_success TEXT,
  item_count INTEGER DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  level TEXT NOT NULL,
  category TEXT NOT NULL,
  action TEXT,
  target TEXT,
  message TEXT,
  duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category, level);

CREATE TABLE IF NOT EXISTS author_cache (
  author TEXT PRIMARY KEY,
  max_stars INTEGER,
  repo_count INTEGER,
  fetched_at TEXT NOT NULL
);
`;

/** Create all tables and indexes. Idempotent (IF NOT EXISTS). */
export function initSchema(db?: DatabaseSync): void {
  const conn = db ?? openDb();
  conn.exec(DDL);
}

/** Read the current schema version from the DB. */
export function getSchemaVersion(): number {
  const conn = openDb();
  const row = conn.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null };
  return row.v ?? 0;
}
