# AI Radar

Local-first personal AI tool discovery station. Fastify + React + node:sqlite, runs on localhost.

## Quick Start

```bash
npm.cmd install
npm.cmd run dev:server   # starts Fastify on 127.0.0.1:3001
npm.cmd run dev:web      # starts Vite on :5173
```

## Tech Stack

- **Runtime**: Node.js v24 (ESM)
- **Language**: TypeScript strict mode
- **Server**: Fastify 5 + node:sqlite (built-in)
- **Frontend** (SP1b): React 18 + Vite + Tailwind + TanStack Query + Lucide
- **Testing**: Vitest
- **LLM** (SP2): Zhipu GLM direct API (OpenAI-compatible)

## Coding Standards

- TypeScript strict, ESM (`"type": "module"`)
- Single file responsibility, max ~300 lines per file
- Conventional commits: `feat:` / `fix:` / `refactor:` / `chore:` / `test:`
- DRY, YAGNI, TDD (write failing test first, then implement)
- Every commit must pass `tsc --noEmit` and `vitest run`

## Directory Structure

```
shared/     - Types shared between server and web
server/     - Fastify backend (DB, collectors, scorer, routes, lib)
  src/db/        - SQLite connection, schema, migrations, repository
  src/collectors/- Data source fetchers (pluggable, one file per source)
  src/scorer/    - 5-dimension weighted scoring engine
  src/routes/    - API endpoints
  src/lib/       - Logger, config, HTTP client, scheduler
web/        - React frontend (SP1b)
data/       - Local SQLite DB + logs (gitignored)
docs/       - Design docs, ADRs, API reference, guides
```

## Security Red Lines (Non-Negotiable)

- HTTP server binds to `127.0.0.1` ONLY, never `0.0.0.0`
- All API keys (GitHub token, LLM key) stored in SQLite settings table, never in plaintext files
- API keys never logged
- Fetch domain whitelist enforced (api.github.com, hn.algolia.com, configured RSS domains)
- Unified error wrapper: `{ ok, data?, error? }` - never leak internal stack traces
- `child_process.spawn` arguments passed as arrays, never shell-concatenated strings
- All external paths use environment variables (e.g., `$CODEX_HOME`), never hardcoded absolute paths like `C:\Users\admin`

## Testing Requirements

- Vitest for all tests
- TDD: write the failing test, run it to confirm failure, implement minimal code, run to confirm pass, commit
- Tests live in `server/tests/` mirroring `server/src/` structure
- Mock HTTP responses for collector tests (no real API calls in CI)

## What NOT To Do

- Do not refactor code unrelated to the current task
- Do not introduce new dependencies without discussion
- Do not skip tests or write tests after implementation
- Do not hardcode absolute paths (use env vars)
- Do not bind the server to anything other than 127.0.0.1
- Do not store secrets in plaintext files or commit `.env`

## Current Status

See [PROGRESS.md](./PROGRESS.md) for current phase status and [TODO.md](./TODO.md) for task tracking.
