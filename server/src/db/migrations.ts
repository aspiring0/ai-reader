import type { DatabaseSync } from 'node:sqlite';
import { getSchemaVersion } from './schema.js';

/** A migration: version number + SQL to execute. */
interface Migration {
  version: number;
  sql: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    sql: '', // Base schema created by initSchema, this just records version 1
  },
];

/**
 * Run all pending migrations in order.
 * Each migration runs in its own transaction.
 * Never modify existing migrations - only append new ones.
 */
export function runMigrations(db?: DatabaseSync): void {
  const currentVersion = getSchemaVersion();
  const pending = migrations.filter((m) => m.version > currentVersion);

  for (const m of pending) {
    if (m.sql) {
      db?.exec(m.sql) ?? void 0;
    }
    db?.prepare('INSERT INTO schema_version (version) VALUES (?)').run(m.version);
  }
}

/** Get the latest available migration version. */
export function getLatestVersion(): number {
  return migrations[migrations.length - 1]?.version ?? 0;
}
