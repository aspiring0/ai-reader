import type { FastifyInstance } from 'fastify';
import { getItemCount } from '../db/repository.js';
import { getAllSyncState } from '../db/repository.js';
import { getUninterpretedCount } from '../db/repository.js';
import { getSettings } from '../lib/config.js';
import { ok } from './helpers.js';
import type { HealthResponse } from '@shared/types';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async (_req, reply) => {
    const settings = getSettings();
    const syncStates = getAllSyncState();
    const lastCollect = syncStates
      .map((s) => s.last_run)
      .filter(Boolean)
      .sort()
      .pop() ?? null;

    const data: HealthResponse = {
      db_items: getItemCount(),
      last_collect: lastCollect,
      github_token: Boolean(settings.github_token),
      uninterpreted_count: getUninterpretedCount(),
    };
    return ok(reply, data);
  });
}
