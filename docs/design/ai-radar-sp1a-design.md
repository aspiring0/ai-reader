# AI Radar SP1a Design

## Overview

Backend subsystem: SQLite database, data collectors (GitHub/HN/RSS), 5-dimension scoring engine, Fastify API, scheduler, and structured logging. Runs on 127.0.0.1:3001.

## Architecture

```
[Scheduler 6h] -> [Collector.fetch()] -> [Dedup] -> [DB insert + Scorer.score()]
                                                        |
[API /api/feed] <- [Frontend SP1b] <- [Repository.query()] <-+
``+

Scoring happens at write time (insert), not at query time.

## DB Schema

See project root AGENTS.md and source code in `server/src/db/schema.ts`.

Tables: `schema_version`, `items`, `settings`, `sync_state`, `logs`, `author_cache`.

Key design: `items.stars_prev` stores previous snapshot of star count for velocity calculation. `items.collected_at` tracks last fetch time for interval computation.

## Scoring

5-dimension weighted scoring. Weights configurable via settings. Normalization is global DB min-max (all scored items).

| Dimension | Default Weight | Formula |
|-----------|---------------|---------|
| star_velocity | 0.35 | `(stars - stars_prev) / interval_days`; fallback `log(stars+1)/log(100001)` when no prev |
| activity | 0.25 | `0.5^(days_since_push / 30)` |
| fork_ratio | 0.15 | peak at 0.05-0.3 ratio, penalty above 0.5 |
| author_reputation | 0.15 | only for score >= 30; `log(max_stars+1)/log(100001)`; cached in author_cache |
| issue_health | 0.10 | `closed / (open + closed)` |

Score threshold: < 20 -> status `hidden`.

## API Endpoints

All return `{ ok: boolean, data?: T, error?: { code: string, message: string } }`.

See `docs/api-reference.md` for details. OpenAPI spec auto-generated at `/api/docs`.

## Degradation

- GitHub rate limit: serial requests + exponential backoff, return cached data, log to sync_state
- RSS unreachable: skip source, others continue
- Single collector error: try-catch isolation, does not affect other sources

## Acceptance Criteria

1. `npm.cmd run dev:server` starts Fastify on 127.0.0.1:3001
2. `GET /api/health` returns DB status + last collect info
3. `POST /api/collect/run` fetches data into DB
4. `GET /api/feed` returns paginated, filterable, sortable, searchable list
5. Score + detail queryable via `/api/feed/:id`
6. Settings read/write works
7. Weight change triggers rescore
8. Logs queryable via `/api/logs`
9. Rate limit degrades gracefully
10. All Vitest tests pass
11. `tsc --noEmit` clean
12. Governance files complete
