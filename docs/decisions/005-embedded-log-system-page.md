# ADR-005: Embedded system page for log visualization

**Date:** 2026-07-15
**Status:** Accepted

## Context

AI Radar needs operational visibility: collect run status, error tracking, API health. The options are external monitoring tools vs. an embedded solution.

## Considered Options

1. **Embedded system page** - Logs stored in SQLite `logs` table, displayed via frontend SystemPage with timeline + metric cards + sync state.
2. **External monitoring** - Prometheus + Grafana, or similar stack.
3. **File-only logs** - Structured JSON to log files, no visualization.

## Decision

Embedded system page.

## Rationale

- The project is a single-user local tool; external monitoring infrastructure is disproportionate.
- SQLite log storage integrates naturally with the existing DB (one file, one query interface).
- The system page aligns with the "transparency" design principle - users see exactly what the system is doing.
- No additional processes, containers, or dependencies.

## Consequences

- Logs occupy DB space (mitigated by 7-day retention with auto-cleanup).
- Query capability is SQLite-level (sufficient for filtering by category/level/time).
- `GET /api/logs` endpoint serves the frontend system page.
