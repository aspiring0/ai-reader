# Developer Guide

## Project Structure

```
shared/     - TypeScript types shared across server and web
server/     - Backend (Fastify + node:sqlite)
web/        - Frontend (React + Vite, SP1b)
data/       - Local DB + logs (gitignored)
docs/       - Documentation and ADRs
```

## Coding Conventions

- TypeScript strict, ESM
- Single file < 300 lines
- Conventional commits
- TDD: test first, then implement

## Running Tests

```bash
npm.cmd test              # Run all tests once
npm.cmd run test:watch    # Watch mode
npm.cmd run typecheck     # tsc --noEmit only
```

## Adding a New Collector

1. Create `server/src/collectors/<source>.ts`
2. Implement the `Collector` interface from `collectors/types.ts`
3. Add tests in `server/tests/collectors.test.ts`
4. Register in the scheduler/collect orchestrator

## Adding a New API Route

1. Create `server/src/routes/<name>.ts`
2. Export a Fastify plugin function
3. Register in `server/src/index.ts`
4. Add tests in `server/tests/routes.test.ts`
5. Document in `docs/api-reference.md`

## DB Migrations

1. Add a new migration in `server/src/db/migrations.ts`
2. Increment the version number
3. The migration runs automatically on server start
4. Never modify existing migrations - only add new ones
