import type { FastifyInstance } from 'fastify';
import { getLogs } from '../lib/logger.js';
import { ok } from './helpers.js';
import type { LogEntry, LogQuery } from '@shared/types';

export async function logsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      category?: string;
      level?: string;
      limit?: string;
      since?: string;
    };
  }>('/api/logs', async (req, reply) => {
    const query: LogQuery = {
      category: req.query.category as LogQuery['category'],
      level: req.query.level as LogQuery['level'],
      limit: req.query.limit ? Number(req.query.limit) : 100,
      since: req.query.since,
    };
    const logs: LogEntry[] = getLogs(query);
    return ok(reply, logs);
  });
}
