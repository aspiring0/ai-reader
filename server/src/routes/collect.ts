import type { FastifyInstance } from 'fastify';
import { triggerNow } from '../lib/scheduler.js';
import { ok, fail } from './helpers.js';

export async function collectRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/collect/run', async (_req, reply) => {
    try {
      await triggerNow();
      return ok(reply, { message: 'Collect run completed' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Collect failed';
      return fail(reply, 'COLLECT_ERROR', message, 409);
    }
  });
}
