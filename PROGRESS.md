# AI Radar - Progress Tracker

## SP1a: Backend (DB + Collectors + Scorer + API + Scheduler + Logger)

**Status:** Complete
**Completion:** 100%
**Started:** 2026-07-15
**Completed:** 2026-07-15

### Tasks

- [x] Project scaffolding (git init, package.json, tsconfig, workspaces)
- [x] Governance files (AGENTS.md, TODO.md, PROGRESS.md, CHANGELOG, DEVLOG)
- [x] Design docs and ADRs
- [x] DB layer (connection, schema, migrations, repository)
- [x] Collectors (GitHub, HackerNews, RSS, dedup)
- [x] Scorer (5-dimension weighted scoring + normalization)
- [x] HTTP lib (retry + rate limit + domain whitelist)
- [x] Scheduler (interval + lock)
- [x] Logger (structured to SQLite)
- [x] Fastify server + routes (feed, settings, health, collect, logs)
- [x] OpenAPI auto-docs
- [x] Rescore on settings update (weight change triggers re-score)
- [x] Code review fixes (stars_prev, fetchWithRetry, error handling)
- [x] Smoke test (server starts, all endpoints verified, real data collected)

### Verification

- Tests: 83/83 passing (7 test files)
- TypeCheck: 0 errors (tsc --noEmit)
- Smoke test: 217 items collected (GitHub + RSS + HN), rescore verified

### Blockers

None.

---

## SP1b: Frontend (FeedPage + SettingsPage + SystemPage)

**Status:** Not Started

## SP2: Interpretation Layer (Zhipu GLM)

**Status:** Not Started

## SP3: Install System (Safety Scan + Codex Adapter)

**Status:** Not Started

## SP4: Codex Skill (ai-radar)

**Status:** Not Started

## SP5: Finance Module

**Status:** Not Started
