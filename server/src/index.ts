import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { openDb, closeDb } from './db/connection.js';
import { initSchema } from './db/schema.js';
import { runMigrations } from './db/migrations.js';
import { responsePlugin } from './routes/helpers.js';
import { feedRoutes } from './routes/feed.js';
import { settingsRoutes } from './routes/settings.js';
import { healthRoutes } from './routes/health.js';
import { collectRoutes } from './routes/collect.js';
import { logsRoutes } from './routes/logs.js';
import { logger } from './lib/logger.js';
import { getSettings } from './lib/config.js';
import { setCollectFn, start, setIntervalMs } from './lib/scheduler.js';
import { GitHubCollector } from './collectors/github.js';
import { HackerNewsCollector } from './collectors/hackernews.js';
import { RSSCollector } from './collectors/rss.js';
import { dedup } from './collectors/dedup.js';
import { scoreItems, getDefaultWeights } from './scorer/index.js';
import { upsertItem, upsertSyncState } from './db/repository.js';
import type { Item, ScoreDetail } from '@shared/types';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.AIRADAR_PORT) || 3001;
const HOST = '127.0.0.1';

async function bootstrap(): Promise<void> {
  // Initialize DB
  const db = openDb();
  initSchema(db);
  runMigrations(db);
  logger.info('system', 'startup', 'Database initialized');

  // Ensure default settings exist
  const settings = getSettings();
  void settings;

  // Create Fastify instance
  const app = Fastify({ logger: false });

  // Swagger/OpenAPI
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'AI Radar API',
        version: '0.1.0',
        description: 'Local-first AI tool discovery station',
      
      },
      servers: [{ url: `http://${HOST}:${PORT}` }],
    
      },
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  // Response plugin (error handler)
  await app.register(responsePlugin);

  // Routes
  await app.register(feedRoutes);
  await app.register(settingsRoutes);
  await app.register(healthRoutes);
  await app.register(collectRoutes);
  await app.register(logsRoutes);

  // Collect orchestrator
  const collectors = [
    new GitHubCollector(),
    new HackerNewsCollector(),
    new RSSCollector(),
  ];

  async function runCollect(): Promise<void> {
    const startTime = Date.now();
    logger.info('collect', 'start', 'Starting collect run');

    for (const collector of collectors) {
      try {
        const startTime2 = Date.now();
        const raw = await collector.fetch();
        const deduped = dedup(raw);

        // Get current settings for weights
        const settings = getSettings();
        const weights = settings.score_weights ?? getDefaultWeights();

        // Score items (author_reputation handled per-item with cache)
        const scored = scoreItems(
          deduped.map((item) => ({
            stars: item.stars,
            stars_prev: null, // Will be updated from DB on upsert
            forks: item.forks,
            pushed_at: item.pushed_at,
            collected_at: new Date().toISOString(),
            open_issues: item.open_issues,
            author_max_stars: 0, // Will be enriched for high-score items
          })),
          weights
        );

        let inserted = 0;
        const now = new Date().toISOString();
        for (let i = 0; i < deduped.length; i++) {
          const raw = deduped[i];
          const score = scored[i];
          const item: Item = {
            id: randomUUID(),
            source_type: raw.source_type,
            source_id: raw.source_id,
            url: raw.url,
            title: raw.title,
            title_zh: null,
            summary: raw.summary,
            lang: raw.lang,
            item_type: raw.item_type as Item['item_type'],
            raw_data: raw.raw_data,
            stars: raw.stars,
            stars_prev: null,
            forks: raw.forks,
            author: raw.author,
            pushed_at: raw.pushed_at,
            score: score.score,
            score_detail: score.detail as ScoreDetail,
            status: score.score >= (settings.score_threshold ?? 20) ? 'scored' : 'hidden',
            is_read: 0,
            is_favorited: 0,
            collected_at: now,
            created_at: now,
            updated_at: now,
          };
          upsertItem(item);
          inserted++;
        }

        const duration = Date.now() - startTime2;
        upsertSyncState(collector.name, {
          last_run: now,
          last_success: now,
          item_count: inserted,
          error: null,
        });
        logger.info('collect', collector.name, `Fetched ${inserted} items`, { durationMs: duration });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        upsertSyncState(collector.name, {
          last_run: new Date().toISOString(),
          last_success: null,
          item_count: 0,
          error: message,
        });
        logger.error('collect', collector.name, `Error: ${message}`);
      }
    }

    const totalDuration = Date.now() - startTime;
    logger.info('collect', 'complete', `Collect run finished`, { durationMs: totalDuration });
  }

  // Register collect function and start scheduler
  setCollectFn(runCollect);
  const settings2 = getSettings();
  setIntervalMs((settings2.fetch_interval_hours ?? 6) * 60 * 60 * 1000);
  start();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('system', 'shutdown', 'Shutting down');
    await app.close();
    closeDb();
    process.exit(0);
  });

  // Start listening
  try {
    await app.listen({ port: PORT, host: HOST });
    logger.info('system', 'listen', `AI Radar running on http://${HOST}:${PORT}`);
    console.log(`AI Radar running on http://${HOST}:${PORT}`);
    console.log(`API docs: http://${HOST}:${PORT}/api/docs`);
  } catch (err) {
    logger.error('system', 'listen', `Failed to start: ${err}`);
    process.exit(1);
  }
}

void bootstrap();



