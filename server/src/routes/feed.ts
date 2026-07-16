import type { FastifyInstance } from 'fastify';
import { queryFeed, getItemById, queryTrending, queryNewSince, getLastCollectTime } from '../db/repository.js';
import { ok } from './helpers.js';
import type { FeedQuery, FeedResult, Item } from '@shared/types';

export async function feedRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      type?: string;
      lang?: string;
      source?: string;
      sort?: string;
     score_min?: string;
      score_max?: string;
      since?: string;
     q?: string;
      page?: string;
      limit?: string;
    };
  }>('/api/feed', async (req, reply) => {
    const q: FeedQuery = {
      type: req.query.type as FeedQuery['type'],
      lang: req.query.lang,
      source: req.query.source as FeedQuery['source'],
      sort: req.query.sort as FeedQuery['sort'],
     score_min: req.query.score_min ? Number(req.query.score_min) : undefined,
      score_max: req.query.score_max ? Number(req.query.score_max) : undefined,
      since: req.query.since,
     q: req.query.q,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    };
    const result: FeedResult = queryFeed(q);
    return ok(reply, result);
  });

  app.get<{ Params: { id: string } }>('/api/feed/:id', async (req, reply) => {
    const item: Item | null = getItemById(req.params.id);
    if (!item) {
      return reply.status(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'Item not found' } });
    }
    return ok(reply, item);
  });

  /** Trending: items with highest recent star growth. */
  app.get('/api/feed/trending', async (_req, reply) => {
    const items = queryTrending(10);
    return ok(reply, { items });
  });

  /** New since a given timestamp (default: last 24h). */
  app.get<{ Querystring: { since?: string } }>('/api/feed/new', async (req, reply) => {
    const since = req.query.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const items = queryNewSince(since, 20);
    return ok(reply, { items, since });
  });

  /** Last collect timestamp (for client-side new-since detection). */
  app.get('/api/feed/meta', async (_req, reply) => {
    const lastCollect = getLastCollectTime();
    return ok(reply, { lastCollect });
  });
}
