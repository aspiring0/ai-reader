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

### SP1b - Frontend implementation

- Built React 18 frontend with Vite, Tailwind (Tokyo Night palette), TanStack Query, Lucide icons
- Implemented card-based FeedPage with source/type filters, sort options, and live search
- Created ItemModal with custom SVG radar chart (5-dimension score visualization) + score bars
- Added favorites toggle and dedicated favorites view
- Built SettingsPage for scoring weight adjustment with instant rescore
- Built SystemPage for structured log viewing and sync state monitoring
- Built AdminPage for manual item management (create/edit/delete via visual interface)
- Added admin CRUD API endpoints and repository functions
- Verified end-to-end: both servers running, admin CRUD tested, web build succeeds
