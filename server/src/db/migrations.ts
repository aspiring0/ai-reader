import type { DatabaseSync } from 'node:sqlite';
import { getSchemaVersion } from './schema.js';

interface Migration {
  version: number;
  sql: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    sql: '',
  },
  {
    version: 2,
    sql: 'ALTER TABLE items ADD COLUMN interpreted_at TEXT;',
  },
  {
    version: 3,
    sql: `CREATE TABLE IF NOT EXISTS installed_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  skill_path TEXT NOT NULL,
  install_method TEXT,
  scan_level TEXT,
  installed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(skill_name)
);`,
  },
  {
    version: 4,
    sql: `CREATE TABLE IF NOT EXISTS installed_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  install_path TEXT NOT NULL,
  run_command TEXT,
  binary_path TEXT,
  docker_image TEXT,
  installed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_name)
);`,
  },
];

/**
 * Run all pending migrations in order.
 * db is required — caller must pass an open connection.
 */
export function runMigrations(db: DatabaseSync): void {
  const currentVersion = getSchemaVersion();
  const pending = migrations.filter((m) => m.version > currentVersion);

  for (const m of pending) {
    if (m.sql) {
      db.exec(m.sql);
    }
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(m.version);
  }
}

export function getLatestVersion(): number {
  return migrations[migrations.length - 1]?.version ?? 0;
}
