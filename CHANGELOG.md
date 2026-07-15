# Changelog

All notable changes to AI Radar will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Project scaffolding: npm workspaces (shared/server/web), TypeScript strict, Vitest
- Governance files: AGENTS.md, TODO.md, PROGRESS.md, CHANGELOG.md, DEVLOG.md
- Design documentation: SP1a design spec, 5 ADRs, API reference, deployment guide, dev guide
- `.gitignore` for data/, node_modules/, .env

## [0.1.0] - 2026-07-15

### SP1a - Backend (DB + Collectors + Scorer + API + Scheduler + Logger)

#### Added
- DB layer: node:sqlite wrapper (WAL mode, auto-mkdir, env-var path), schema, migration system, repository CRUD
- Collectors: GitHub (search API), HackerNews (Algolia), RSS (jiqizhixin/36kr/qbitai), dedup logic
- Scorer: 5-dimension weighted scoring (star velocity, activity, fork ratio, author reputation, issue health) with global min-max normalization
- HTTP lib: fetchWithRetry with domain whitelist (SSRF protection), exponential backoff, timeout
- Scheduler: interval-based with running lock, manual trigger endpoint
- Logger: structured logs to SQLite logs table with query/filter support
- API routes: /api/feed (filter/sort/search/paginate), /api/feed/:id, /api/settings, /api/health, /api/collect/run, /api/logs, /api/docs (OpenAPI)
- Rescore on settings update: changing score_weights triggers full re-score of all items
- Unified error handling: CollectError typed class (rate_limit/network/parse/auth/not_found)
- Star velocity via snapshot comparison (stars_prev column, zero extra API calls)
- Graceful degradation: rate limit retry, per-collector isolation, cached data fallback

#### Fixed
- DB connection auto-creates data/ directory (was failing on first start)
- DB path anchored to project root via import.meta.url (CWD-independent)
- typecheck script now points to server/tsconfig.json
- stars_prev populated via getExistingStars() before upsert
- All collectors use fetchWithRetry (no direct fetch bypass)
- Variable shadowing, deterministic IDs, dead code cleanup
