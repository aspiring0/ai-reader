import type { FastifyInstance } from 'fastify';
import { getDailyScoreCounts, getSourceDistribution, getScoreDistribution, getTopTopics, getTopLanguages } from '../db/repository.js';
import { ok } from './helpers.js';

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/stats', async (_req, reply) => {
    return ok(reply, {
      daily_scores: getDailyScoreCounts(30),
      source_distribution: getSourceDistribution(),
      score_distribution: getScoreDistribution(),
      top_topics: getTopTopics(20),
      top_languages: getTopLanguages(10),
    });
  });
}
