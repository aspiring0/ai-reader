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

**Status:** Complete
**Completion:** 100%

## SP2: Interpretation Layer (Zhipu GLM)

**Status:** Complete
**Completion:** 100%
**Started:** 2026-07-15
**Completed:** 2026-07-16

### Tasks

- [x] Design doc reviewed and corrected (preserve title_zh on re-collect)
- [x] Phase 1: Types + migration v2 + repository (interpreted_at, getUninterpretedItems)
- [x] Phase 2: LLM client (glm-4-plus, prompt, retry, JSON parse, typed errors)
- [x] Phase 3: Interpreter module (batch orchestration, error isolation, rate limiter)
- [x] Phase 4: API routes (interpret/run, interpret/:id, LLM_NOT_CONFIGURED)
- [x] Phase 5: Pipeline integration (auto-interpret after collect when API key set)
- [x] Phase 6: Frontend (SettingsPage LLM config, ItemModal Chinese, FeedPage fallback, SystemPage trigger)

### Verification

- Tests: 102/102 passing (10 test files, 19 new SP2 tests)
- TypeCheck: 0 errors
- Web build: succeeds

## SP3: Install System (Safety Scan + Codex Adapter)

**Status:** Complete
**Completion:** 100%
**Started:** 2026-07-16
**Completed:** 2026-07-16

### Tasks

- [x] Phase 1: Compatibility detector + safety scanner (tier A-F classification, 5-stage scan)
- [x] Phase 2: Install engine + DB migration v3 (selective API download + git clone fallback)
- [x] Phase 3: API routes (check, run, status, delete)
- [x] Phase 4: Frontend integration (InstallModal, SystemPage installed skills list)
- [x] Phase 5: Integration test + security hardening
  - End-to-end test: discover -> check -> scan -> install -> verify -> uninstall
  - Dangerous skill detection test (prompt injection -> red -> blocked)
  - Fixed routing bug (item IDs with slashes now use wildcard param)
  - Sanitized skill name from raw_data (path traversal prevention)
  - Verified skill_path containment before filesystem delete

### Verification

- Tests: 160/160 passing (15 test files, 2 new integration tests)
- TypeCheck: 0 errors (server + web)
- Security: path traversal blocked, skill name sanitized, delete path validated

### Post-SP3 Improvement: Nested Skill Detection

- Detects SKILL.md in subdirectories (skills/<name>/SKILL.md)
- Git Trees API fallback when Contents API returns empty
- Installer downloads from correct nested path
- 3 new compatibility tests for nested detection
- Tests: 163/163 passing
- Verified with real repo: oil-oil/beautify-github-readme (Tier A, green)

### Blockers

None.

## SP4: Desktop Deployment

**Status:** Planning
**Started:** 2026-07-16

### Goal

Package AI Radar as a self-contained, desktop-deployable application rather than a Codex skill. The dashboard (Fastify server + React frontend + embedded SQLite) is a standalone app, so the goal is to let a non-developer install and run it with one command and have it persist data and optionally auto-start on boot, with no Node toolchain required on the host.

### Candidate Approaches

- Node SEA / `pkg` single-binary bundling of the server + prebuilt web assets
- Electron or Tauri wrapper for a native window, tray icon, and auto-start
- Lightweight path: `npm start` + a startup script / launchd / Task Scheduler entry

### Open Decisions

- Target platforms (Windows first, then macOS/Linux?)
- Whether a native window (Electron/Tauri) is worth the added complexity vs. a bundled server that opens the browser
- Auto-update strategy and where the SQLite database lives per platform

## SP5: Finance Module

**Status:** Not Started
