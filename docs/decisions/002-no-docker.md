# ADR-002: Do not use Docker

**Date:** 2026-07-15
**Status:** Accepted

## Context

AI Radar needs deep host integration: read/write `.codex/skills/`, spawn local Python scripts, call cc-switch on localhost. The question is whether to containerize.

## Considered Options

1. **No Docker** - Run directly on host. `git clone && npm install && npm run dev`.
2. **Full Docker** - Containerize everything.
3. **Hybrid** - Main app on host, specific tasks (fetch, security scan) in containers.

## Decision

No Docker.

## Rationale

- Containerization conflicts with core requirements: volume mounts for `.codex/`, cross-boundary Python execution, localhost network bridging to cc-switch.
- On Windows these container-host integrations are especially painful.
- The project has no complex dependency chain requiring isolation - just Node.js.
- Security for skill installation is handled by the safety scanner (SP3), not by containerization.

## Consequences

- Simpler setup: three commands to run.
- No environment parity issues between dev and prod.
- If multi-user cloud deployment is needed later, the data pipeline (collectors/scorer/interpreter) can be extracted to a container; the install action stays host-side.
