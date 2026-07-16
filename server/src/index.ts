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
import { adminRoutes } from './routes/admin.js';
import { interpretRoutes } from './routes/interpret.js';
import { installRoutes } from './routes/install.js';
import { logger } from './lib/logger.js';
import { runInterpretation } from './interpreter/index.js';
import { getSettings } from './lib/config.js';
import { setCollectFn, start, setIntervalMs } from './lib/scheduler.js';
import { GitHubCollector } from './collectors/github.js';
import { HackerNewsCollector } from './collectors/hackernews.js';
import { RSSCollector } from './collectors/rss.js';
import { dedup } from './collectors/dedup.js';
import { scoreItems, getDefaultWeights } from './scorer/index.js';
import { upsertItem, upsertSyncState, getExistingStars } from './db/repository.js';
import type { Item, ScoreDetail } from '@shared/types';

const PORT = Number(process.env.AIRADAR_PORT) || 3001;
const HOST = '127.0.0.1';

async function bootstrap(): Promise<void> {
  const db = openDb();
  initSchema(db);
  runMigrations(db);
  logger.info('system', 'startup', 'Database initialized');

  getSettings();

  const app = Fastify({ logger: false });

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
  await app.register(responsePlugin);
  await app.register(feedRoutes);
  await app.register(settingsRoutes);
  await app.register(healthRoutes);
  await app.register(collectRoutes);
  await app.register(logsRoutes);
  await app.register(adminRoutes);
  await app.register(interpretRoutes);
  await app.register(installRoutes);

  const collectors = [
    new GitHubCollector(),
    new HackerNewsCollector(),
    new RSSCollector(),
  ];

  async function runCollect(): Promise<void> {
    const startTime = Date.now();
    logger.info('collect', 'start', 'Starting collect run');
    const now = new Date().toISOString();

    for (const collector of collectors) {
      try {
        const sourceStart = Date.now();
        const rawItems = await collector.fetch();
        const deduped = dedup(rawItems);

        const settings = getSettings();
        const weights = settings.score_weights ?? getDefaultWeights();

        // Read existing stars from DB for snapshot-based velocity
        const snapshotData = deduped.map((item) => ({
          stars: item.stars,
          stars_prev: getExistingStars(item.source_type, item.source_id),
          forks: item.forks,
          pushed_at: item.pushed_at,
          collected_at: now,
          open_issues: item.open_issues,
          author_max_stars: 0,
        }));

        const scored = scoreItems(snapshotData, weights);

        let inserted = 0;
        for (let i = 0; i < deduped.length; i++) {
          const rawItem = deduped[i];
          const prevStars = snapshotData[i].stars_prev;
          const existing = prevStars !== null;
          const item: Item = {
            id: `${rawItem.source_type}:${rawItem.source_id}`,
            source_type: rawItem.source_type,
            source_id: rawItem.source_id,
            url: rawItem.url,
            title: rawItem.title,
            title_zh: null,
            summary: rawItem.summary,
            lang: rawItem.lang,
            item_type: rawItem.item_type as Item['item_type'],
            raw_data: rawItem.raw_data,
            stars: rawItem.stars,
            stars_prev: prevStars,
            forks: rawItem.forks,
            author: rawItem.author,
            pushed_at: rawItem.pushed_at,
            score: scored[i].score,
            score_detail: scored[i].detail as ScoreDetail,
            status: scored[i].score >= (settings.score_threshold ?? 20) ? 'scored' : 'hidden',
           is_read: 0,
           is_favorited: 0,
           collected_at: now,
           created_at: now,
           updated_at: now,
           interpreted_at: null,
         };
          // Preserve created_at for existing items via upsert (ON CONFLICT keeps original)
          void existing;
          upsertItem(item);
          inserted++;
        }

        const duration = Date.now() - sourceStart;
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
          last_run: now,
          last_success: null,
          item_count: 0,
          error: message,
        });
        logger.error('collect', collector.name, `Error: ${message}`);
      }
    }

    const totalDuration = Date.now() - startTime;
    logger.info('collect', 'complete', `Collect run finished`, { durationMs: totalDuration });

    // Auto-interpret newly collected items when LLM API key is configured
    const postSettings = getSettings();
    if (postSettings.llm_api_key?.trim()) {
      logger.info('interpret', 'auto', 'Starting auto-interpretation after collect');
      await runInterpretation();
    }
  }

  setCollectFn(runCollect);
  const schedSettings = getSettings();
  setIntervalMs((schedSettings.fetch_interval_hours ?? 6) * 60 * 60 * 1000);
  start();

  process.on('SIGINT', async () => {
    logger.info('system', 'shutdown', 'Shutting down');
    await app.close();
    closeDb();
    process.exit(0);
  });

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
