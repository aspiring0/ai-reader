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
