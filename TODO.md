# SP1a Task List

Each task follows TDD: write failing test -> confirm red -> implement -> confirm green -> commit.
Every commit must pass `tsc --noEmit` and `vitest run`.

## Phase 0: Scaffolding [DONE]

- [x] T0.1: git init, .gitignore, package.json (workspaces), tsconfig.base.json
- [x] T0.2: AGENTS.md, PROGRESS.md, CHANGELOG.md, DEVLOG.md, TODO.md
- [x] T0.3: docs/design/ spec, docs/decisions/ ADRs, docs/ guides
- [x] T0.4: shared/types.ts (shared type definitions)
- [x] T0.5: Install dependencies, verify tsc + vitest baseline
- [x] **Commit: `chore: init project`**

## Phase 1: DB Layer

- [ ] T1.1: Write `server/tests/repository.test.ts` (schema creation, migration versioning, CRUD: insert/upsert item, get by id, query feed with filters, settings get/put, sync_state upsert, log insert/query, author_cache). **Verify: tests fail (red).**
- [ ] T1.2: Implement `server/src/db/connection.ts` (node:sqlite DatabaseSync wrapper, WAL mode, singleton). **Verify: module loads.**
- [ ] T1.3: Implement `server/src/db/schema.ts` (all DDL from design spec). **Verify: tables created on init.**
- [ ] T1.4: Implement `server/src/db/migrations.ts` (version tracking, sequential execution). **Verify: schema_version increments.**
- [ ] T1.5: Implement `server/src/db/repository.ts` (all CRUD operations from T1.1 tests). **Verify: tests pass (green).**
- [ ] **Commit: `feat: db layer (connection, schema, migrations, repository)`**
- [ ] **Acceptance: repository tests all green, tsc passes.**

## Phase 2: Collectors

- [ ] T2.1: Write `server/tests/collectors.test.ts` for GitHub collector (mock fetch, verify field mapping, pagination, error handling for 404/429/empty). **Verify: red.**
- [ ] T2.2: Implement `server/src/collectors/types.ts` (Collector interface, RawItem type). **Verify: compiles.**
- [ ] T2.3: Implement `server/src/collectors/github.ts`. **Verify: tests green.**
- [ ] T2.4: Add HN Algolia collector tests + implementation. **Verify: green.**
- [ ] T2.5: Add RSS collector tests + implementation. **Verify: green.**
- [ ] T2.6: Write `server/tests/dedup.test.ts` (URL normalization, title Jaccard similarity). **Verify: red then green.**
- [ ] T2.7: Implement `server/src/collectors/dedup.ts`. **Verify: green.**
- [ ] **Commit: `feat: collectors (github, hackernews, rss, dedup)`**
- [ ] **Acceptance: all collector + dedup tests green.**

## Phase 3: Scorer

- [ ] T3.1: Write `server/tests/scorer.test.ts` (5-dimension calculation, normalization, boundary cases: 0 stars, ultra-high stars, no stars_prev, no pushed_at, weight changes). **Verify: red.**
- [ ] T3.2: Implement `server/src/scorer/index.ts`. **Verify: tests green.**
- [ ] T3.3: Add author_cache integration (query cache, API miss -> fetch -> cache). **Verify: author_cache tests green.**
- [ ] **Commit: `feat: scoring engine (5-dimension weighted + normalization)`**
- [ ] **Acceptance: scorer tests all green, normalization correct.**

## Phase 4: Lib Layer

- [ ] T4.1: Implement `server/src/lib/http.ts` (fetch wrapper, retry with exponential backoff, rate limit handling, domain whitelist). **Verify: unit test for retry logic.**
- [ ] T4.2: Implement `server/src/lib/logger.ts` (structured JSON log to SQLite, query interface). **Verify: log write/read test.**
- [ ] T4.3: Implement `server/src/lib/config.ts` (settings read/write from DB, defaults). **Verify: config read/write test.**
- [ ] T4.4: Implement `server/src/lib/scheduler.ts` (setInterval + run lock, manual trigger). **Verify: scheduler logic test.**
- [ ] **Commit: `feat: lib layer (http, logger, config, scheduler)`**
- [ ] **Acceptance: all lib tests green.**

## Phase 5: API Server

- [ ] T5.1: Write `server/tests/routes.test.ts` (feed pagination/filter/sort/search, settings get/put, health, collect trigger, logs query). **Verify: red.**
- [ ] T5.2: Implement `server/src/routes/feed.ts` (GET /api/feed, GET /api/feed/:id). **Verify: feed tests green.**
- [ ] T5.3: Implement `server/src/routes/settings.ts` (GET/PUT /api/settings). **Verify: settings tests green.**
- [ ] T5.4: Implement `server/src/routes/health.ts` (GET /api/health). **Verify: health test green.**
- [ ] T5.5: Implement `server/src/routes/collect.ts` (POST /api/collect/run). **Verify: collect test green.**
- [ ] T5.6: Implement `server/src/routes/logs.ts` (GET /api/logs). **Verify: logs test green.**
- [ ] T5.7: Implement `server/src/index.ts` (Fastify bootstrap, 127.0.0.1 bind, Swagger/OpenAPI plugin). **Verify: server starts.**
- [ ] **Commit: `feat: fastify server + all routes + openapi`**
- [ ] **Acceptance: all route tests green, server starts on :3001.**

## Phase 6: Integration

- [ ] T6.1: Integration test: full collect run (mock all sources) -> score -> feed query. **Verify: end-to-end green.**
- [ ] T6.2: Integration test: settings weight change -> rescore -> feed order changes. **Verify: green.**
- [ ] T6.3: Integration test: GitHub rate limit -> graceful degradation. **Verify: green.**
- [ ] **Commit: `test: integration tests (collect, score, degrade)`**
- [ ] **Acceptance: all integration tests green.**

## Phase 7: SP1a Completion

- [ ] T7.1: Run full test suite + tsc, fix any issues
- [ ] T7.2: Update PROGRESS.md to 100%
- [ ] T7.3: Update CHANGELOG.md
- [ ] **Commit: `chore: sp1a complete`**

## SP1a Acceptance Criteria

1. `npm.cmd run dev:server` starts Fastify on 127.0.0.1:3001
2. `GET /api/health` returns DB status + last collect info
3. `POST /api/collect/run` fetches GitHub/HN/RSS data into DB
4. `GET /api/feed` returns paginated list with filter/sort/search
5. Score + per-dimension detail queryable
6. `GET/PUT /api/settings` works
7. Weight change -> rescore -> order changes
8. `GET /api/logs` returns filtered logs
9. GitHub rate limit -> degrades gracefully
10. All Vitest tests pass
11. `tsc --noEmit` clean
12. Governance files complete
