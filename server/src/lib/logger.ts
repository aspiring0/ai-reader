import type { LogEntry, LogQuery, LogLevel, LogCategory } from '@shared/types';
import { insertLog, queryLogs } from '../db/repository.js';

export interface LogInput {
  level: LogLevel;
  category: LogCategory;
  action?: string;
  target?: string;
  message?: string;
  durationMs?: number;
}

/** Log a structured entry to the SQLite logs table. */
export function log(input: LogInput): void {
  insertLog({
    ts: new Date().toISOString(),
    level: input.level,
    category: input.category,
    action: input.action ?? null,
    target: input.target ?? null,
    message: input.message ?? null,
    duration_ms: input.durationMs ?? null,
  });
}

/** Convenience methods. */
export const logger = {
  info: (category: LogCategory, action: string, message: string, opts?: { target?: string; durationMs?: number }) =>
    log({ level: 'info', category, action, message, ...opts }),
  warn: (category: LogCategory, action: string, message: string, opts?: { target?: string; durationMs?: number }) =>
    log({ level: 'warn', category, action, message, ...opts }),
  error: (category: LogCategory, action: string, message: string, opts?: { target?: string; durationMs?: number }) =>
    log({ level: 'error', category, action, message, ...opts }),
};

/** Query logs with filters. */
export function getLogs(query: LogQuery): LogEntry[] {
  return queryLogs(query);
}

/** Delete logs older than N days. */
export function cleanOldLogs(_daysToKeep = 7): number {
  // Will be implemented when we add a deleteLogs function to repository
  // For now, this is a placeholder that returns 0
  return 0;
}
