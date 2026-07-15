import { DatabaseSync } from 'node:sqlite';

let dbInstance: DatabaseSync | null = null;

/**
 * Opens (or returns) the singleton SQLite database connection.
 * Uses WAL mode for file-based DBs. In-memory DBs skip WAL.
 * Path controlled by AIRADAR_DB_PATH env var (default: ./data/airadar.db).
 */
export function openDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  const dbPath = process.env.AIRADAR_DB_PATH || './data/airadar.db';
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
