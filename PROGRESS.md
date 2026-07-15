# AI Radar - Progress Tracker

## SP1a: Backend (DB + Collectors + Scorer + API + Scheduler + Logger)

**Status:** In Progress
**Completion:** 5%
**Started:** 2026-07-15

### Tasks

- [x] Project scaffolding (git init, package.json, tsconfig, workspaces)
- [x] Governance files (AGENTS.md, TODO.md, PROGRESS.md, CHANGELOG, DEVLOG)
- [x] Design docs and ADRs
- [ ] DB layer (connection, schema, migrations, repository)
- [ ] Collectors (GitHub, HackerNews, RSS, dedup)
- [ ] Scorer (5-dimension weighted scoring + normalization)
- [ ] HTTP lib (retry + rate limit)
- [ ] Scheduler (interval + lock)
- [ ] Logger (structured JSON to SQLite)
- [ ] Fastify server + routes (feed, settings, health, collect, logs)
- [ ] OpenAPI auto-docs

### Blockers

None.

### Next Steps

DB layer implementation: connection wrapper, schema DDL, migration system, repository CRUD.

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
