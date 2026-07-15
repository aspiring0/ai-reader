import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchor DB path to project root so it resolves correctly regardless of CWD.
// This file lives at server/src/db/ → project root is 3 levels up.
const _here = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(_here, '..', '..', '..');
const DEFAULT_DB_PATH = join(PROJECT_ROOT, 'data', 'airadar.db');

let dbInstance: DatabaseSync | null = null;

/**
 * Opens (or returns) the singleton SQLite database connection.
 * Uses WAL mode for file-based DBs. In-memory DBs skip WAL.
 * Path controlled by AIRADAR_DB_PATH env var (default: <project-root>/data/airadar.db).
 */
export function openDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  const dbPath = process.env.AIRADAR_DB_PATH || DEFAULT_DB_PATH;

  // Ensure parent directory exists for file-based DBs (node:sqlite won't create it)
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  dbInstance = new DatabaseSync(dbPath);
  dbInstance.exec('PRAGMA journal_mode = WAL;');
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  return dbInstance;
}

/** Close the singleton connection (primarily for tests). */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/** Reset the singleton — for tests that need a fresh DB. */
export function resetDb(): void {
  closeDb();
}
