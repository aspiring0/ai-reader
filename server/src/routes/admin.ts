import type { FastifyInstance } from 'fastify';
import {
  deleteItem,
  updateItemFields,
  getItemById,
  getItemCounts,
  queryAllItems,
  upsertItem,
} from '../db/repository.js';
import { logger } from '../lib/logger.js';
import { ok, fail } from './helpers.js';
import type { Item, ItemType, SourceType } from '@shared/types';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  /** Admin dashboard counts */
  app.get('/api/admin/stats', async (_req, reply) => {
    const counts = getItemCounts();
    return ok(reply, counts);
  });

  /** List all items (including hidden) for admin table */
  app.get<{ Querystring: { page?: string; limit?: string } }>(
    '/api/admin/items',
    async (req, reply) => {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
      const page = Math.max(1, Number(req.query.page) || 1);
      const offset = (page - 1) * limit;
      const result = queryAllItems(limit, offset);
      return ok(reply, result);
    }
  );

  /** Update item fields */
  app.put<{
    Params: { id: string };
    Body: Partial<Pick<Item, 'title' | 'title_zh' | 'summary' | 'score' | 'status' | 'item_type' | 'lang' | 'url' | 'is_favorited' | 'is_read'>>;
  }>('/api/admin/items/:id', async (req, reply) => {
    const existing = getItemById(req.params.id);
    if (!existing) return fail(reply, 'NOT_FOUND', 'Item not found', 404);
    updateItemFields(req.params.id, req.body);
    const updated = getItemById(req.params.id);
    logger.info('api', 'admin_update', 'Updated item ' + req.params.id);
    return ok(reply, updated);
  });

  /** Delete an item */
  app.delete<{ Params: { id: string } }>('/api/admin/items/:id', async (req, reply) => {
    const existing = getItemById(req.params.id);
    if (!existing) return fail(reply, 'NOT_FOUND', 'Item not found', 404);
    deleteItem(req.params.id);
    logger.info('api', 'admin_delete', 'Deleted item ' + req.params.id);
    return ok(reply, { deleted: req.params.id });
  });

  /** Create a manual item */
  app.post<{ Body: Partial<Item> & { source_type: SourceType; title: string; url: string } }>(
    '/api/admin/items',
    async (req, reply) => {
      const now = new Date().toISOString();
      const body = req.body;
      const id = 'manual:' + now + ':' + Math.random().toString(36).slice(2, 8);
      const item: Item = {
        id,
        source_type: body.source_type || 'github',
        source_id: body.source_id || id,
        url: body.url,
        title: body.title,
        title_zh: body.title_zh ?? null,
        summary: body.summary ?? null,
        lang: body.lang ?? 'en',
        item_type: (body.item_type as ItemType) ?? 'project',
        raw_data: body.raw_data ?? null,
        stars: body.stars ?? 0,
        stars_prev: null,
        forks: body.forks ?? 0,
        author: body.author ?? null,
        pushed_at: body.pushed_at ?? now,
        score: body.score ?? 50,
        score_detail: body.score_detail ?? null,
        status: body.status ?? 'scored',
        is_read: 0,
        is_favorited: 0,
        collected_at: now,
        created_at: now,
        updated_at: now,
      };
      upsertItem(item);
      logger.info('api', 'admin_create', 'Created manual item ' + id);
      return ok(reply, item, 201);
    }
  );
}
