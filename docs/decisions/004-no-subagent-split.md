# ADR-004: Do not split into subagents

**Date:** 2026-07-15
**Status:** Accepted

## Context

The superpowers methodology includes a subagent-driven-development workflow that dispatches fresh subagents per task with two-stage review. The question is whether to use this pattern for AI Radar.

## Considered Options

1. **Subagent-driven** - Dispatch one subagent per module (DB, collectors, scorer, API, frontend), with spec review + code quality review after each.
2. **Single agent sequential** - One agent follows the implementation plan task by task, self-testing and committing.

## Decision

Single agent sequential.

## Rationale

- Project size is moderate: ~15 source files in SP1a. This fits comfortably in one agent's context.
- Subagent overhead (context construction, review dispatch, coordination) exceeds the coordination benefit at this scale.
- The user explicitly confirmed: "don't split agents so granularly, just have confidence to complete it."
- The implementation plan (TODO.md) provides the same structure that subagents would follow, without the dispatch overhead.

## Consequences

- Faster execution (no subagent dispatch overhead).
- The implementer holds full context across modules (better for cross-module consistency).
- If the project grows significantly, this decision can be revisited for future sub-projects.
