import type { FastifyInstance } from 'fastify';
import { getSettings, updateSettings } from '../lib/config.js';
import { getAllItemsForScoring, updateItemScore } from '../db/repository.js';
import { scoreItems, getDefaultWeights } from '../scorer/index.js';
import { logger } from '../lib/logger.js';
import { ok } from './helpers.js';
import type { Settings } from '@shared/types';

/**
 * Re-score all items in the DB with the given weights.
 * Extracts open_issues from raw_data JSON for GitHub items.
 */
function rescoreAll(weights: Settings['score_weights'], threshold: number): void {
  const items = getAllItemsForScoring();
  if (items.length === 0) return;

  const snapshotData = items.map((item) => {
    let openIssues: number | undefined;
    if (item.raw_data) {
      try {
        const raw = JSON.parse(item.raw_data) as Record<string, unknown>;
        if (typeof raw.open_issues_count === 'number') openIssues = raw.open_issues_count;
        else if (typeof raw.open_issues === 'number') openIssues = raw.open_issues;
      } catch {
        // Ignore parse errors
      }
    }
    return {
      stars: item.stars,
      stars_prev: item.stars_prev,
      forks: item.forks,
      pushed_at: item.pushed_at,
      collected_at: item.collected_at,
      open_issues: openIssues,
      author_max_stars: 0,
    };
  });

  const scored = scoreItems(snapshotData, weights ?? getDefaultWeights());
  for (let i = 0; i < items.length; i++) {
    const status = scored[i].score >= threshold ? 'scored' : 'hidden';
    updateItemScore(items[i].id, scored[i].score, scored[i].detail, status);
  }
   logger.info('score', 'rescore', 'Rescored ' + items.length + ' items with new weights');
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings', async (_req, reply) => {
    const settings: Settings = getSettings();
    const masked = {
      ...settings,
      github_token: settings.github_token ? '***' : '',
      llm_api_key: settings.llm_api_key ? '***' : '',
    };
    return ok(reply, masked);
  });

  app.put<{ Body: Partial<Settings> }>('/api/settings', async (req, reply) => {
    const updated = updateSettings(req.body);

    // Re-score all items when score_weights or threshold changes
    if (req.body.score_weights || req.body.score_threshold) {
      rescoreAll(updated.score_weights, updated.score_threshold ?? 20);
    }

    const masked = {
      ...updated,
      github_token: updated.github_token ? '***' : '',
      llm_api_key: updated.llm_api_key ? '***' : '',
    };
    return ok(reply, masked);
  });
}
