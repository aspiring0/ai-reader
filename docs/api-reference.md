# API Reference

Base URL: `http://127.0.0.1:3001`

All responses wrapped in `{ ok: boolean, data?: T, error?: { code: string, message: string } }`.

## GET /api/feed

Paginated list of items.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| type | string | all | Filter by item_type: project, news, skill, agent |
| lang | string | all | Filter by language: en, zh |
| source | string | all | Filter by source_type: github, hackernews, rss |
| sort | string | score | Sort order: score, hot, recent |
| score_min | number | 0 | Minimum score threshold |
| q | string | - | Search query (LIKE on title + summary) |
| page | number | 1 | Page number (1-based) |
| limit | number | 50 | Items per page (max 100) |

**Response data:** `{ items: Item[], total: number, page: number, limit: number }`

## GET /api/feed/:id

Single item detail including raw_data and score_detail.

**Response data:** `Item` (full detail)

## GET /api/settings

**Response data:** `Settings` object

## PUT /api/settings

**Body:** Partial `Settings` object (merge update)

**Response data:** Updated `Settings`

## GET /api/health

**Response data:** `{ db_items: number, last_collect: string|null, github_token: boolean }`

## POST /api/collect/run

Trigger a manual collect run across all sources.

**Response data:** `{ results: { source: string, fetched: number, errors: string[] }[] }`

## GET /api/logs

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| category | string | all | Filter: collect, score, api, system |
| level | string | all | Filter: info, warn, error |
| limit | number | 100 | Max results |
| since | string | - | ISO timestamp lower bound |

**Response data:** `LogEntry[]`

## GET /api/docs

Auto-generated OpenAPI 3.1 specification (Swagger UI).
