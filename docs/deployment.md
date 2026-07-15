# Deployment Guide

## Prerequisites

- Node.js v24+ (`node --version`)
- npm (use `npm.cmd` in PowerShell on Windows)
- Git

## Install

```bash
git clone <repo-url> ai-radar
cd ai-radar
npm.cmd install
```

## Run (Development)

```bash
npm.cmd run dev:server    # Fastify on 127.0.0.1:3001
npm.cmd run dev:web       # Vite on :5173 (SP1b)
```

## Configuration

Settings are managed via the API (`PUT /api/settings`) or the settings page (SP1b).

Key settings:

| Key | Default | Description |
|-----|---------|-------------|
| github_token | (empty) | GitHub Personal Access Token (read-only recommended) |
| fetch_interval_hours | 6 | Auto-collect interval |
| topic_words | ai-agent,codex-skill,... | GitHub search topics |
| score_weights | {velocity:0.35,...} | Scoring dimension weights |
| score_threshold | 20 | Minimum score to show (below = hidden) |
| llm_api_key | (empty) | Zhipu GLM API key (SP2) |
| llm_base_url | https://open.bigmodel.cn/api/paas/v4 | LLM endpoint (SP2) |
| llm_model | glm-4-plus | LLM model name (SP2) |

## Data Location

All data stored in `data/airadar.db` (gitignored). DB uses WAL mode.
Logs stored in the same SQLite file (`logs` table).

## Environment Variables

| Var | Default | Description |
|-----|---------|-------------|
| CODEX_HOME | ~/.codex | Codex home directory (used by SP3 install) |
| AIRADAR_PORT | 3001 | Server port |
| AIRADAR_DB_PATH | ./data/airadar.db | SQLite file path |
