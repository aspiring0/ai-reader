# Development Log

## 2026-07-15

### Project kickoff

- Explored local environment: confirmed Node v24, Python 3.11, git, cc-switch running on :15721
- Confirmed `node:sqlite` available in Node v24 (experimental but functional)
- Reviewed official Codex skill installer script (`install-skill-from-github.py`) - has zip-slip and path traversal protections
- Went through multiple rounds of design review with user
- Key decisions made:
  - No Docker (host integration needs conflict with containerization)
  - No subagent split (project size suits single-agent sequential execution)
  - Zhipu GLM direct API instead of cc-switch proxy (eliminates runtime dependency)
  - Internal system page for log visualization (no external monitoring tools)
  - node:sqlite for zero native dependencies
  - Global DB normalization for cross-batch score comparability
  - Star velocity via snapshot diff (zero extra API calls)
- Wrote and self-reviewed SP1a design spec
- Created project scaffolding and governance files
