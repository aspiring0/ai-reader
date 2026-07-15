# ADR-001: Use node:sqlite instead of better-sqlite3

**Date:** 2026-07-15
**Status:** Accepted

## Context

AI Radar needs a local embedded database for storing items, settings, logs, and sync state. The two main options are `better-sqlite3` (mature, widely used) and Node.js v24 built-in `node:sqlite` (experimental, zero-dependency).

## Considered Options

1. **better-sqlite3** - Mature, synchronous API, prebuilt binaries for Windows. Requires native compilation or prebuilt download. Version 12.11.1 available.
2. **node:sqlite** - Built into Node.js v24. Zero dependencies. Experimental API (may change). Verified functional: table creation, CRUD, all working.

## Decision

Use `node:sqlite`.

## Rationale

- Zero native dependencies means `npm install` is fast and reliable on Windows (no build tools needed).
- The project targets Node v24+ exclusively (single user, controlled environment).
- Risk of experimental API changes is mitigated by a thin wrapper in `db/connection.ts` - if the API breaks, only that one file needs updating.

## Consequences

- Must use `--experimental-sqlite` flag or accept the experimental warning on stderr (Node v24 silences this by default).
- Fallback to better-sqlite3 is straightforward: only `db/connection.ts` changes.
- Type definitions may be incomplete; we define our own interfaces in the wrapper.
