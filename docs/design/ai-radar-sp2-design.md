# AI Radar SP2 Design

## Overview

Interpretation layer: after items are collected and scored (SP1a), the interpreter calls Zhipu GLM to generate a Chinese title (title_zh) and a Chinese summary (summary) for each scored item. This makes the feed readable for Chinese-speaking users without manual curation.

Per ADR-003, the LLM is called directly via the Zhipu OpenAI-compatible endpoint (open.bigmodel.cn). No dependency on cc-switch.

## Architecture

```
[Scheduler 6h] -> [Collector] -> [Dedup] -> [Score + Insert]
                                                        |
                                          [Interpreter] (if llm_api_key configured)
                                                        |
                                          [LLM: GLM-4-plus] -- open.bigmodel.cn
                                                        |
                                          [Update DB: title_zh + summary + interpreted_at]
```

Interpretation runs only when settings.llm_api_key is non-empty. Without a key, the pipeline degrades gracefully (no error, items remain with original English titles).

## When You Need the LLM API

The LLM API is needed starting at SP2. SP1a/SP1b operate fully without it.

| Phase | Needs LLM? | Why |
|-------|-----------|-----|
| SP1a Backend | No | Collection, scoring, storage all use deterministic logic |
| SP1b Frontend | No | Feed/Settings/System pages work with raw English titles |
| **SP2 Interpretation** | **Yes** | GLM translates titles and writes Chinese summaries |
| SP3 Install System | No | Safety scan + Codex adapter are rule-based |

The user obtains a Zhipu API key from bigmodel.cn (one-time), enters it in Settings, and the pipeline begins auto-interpreting.

## DB Migration (version 2)

One new column on items:

```sql
ALTER TABLE items ADD COLUMN interpreted_at TEXT;
```

interpreted_at is NULL until the interpreter successfully writes title_zh + summary. This column doubles as the "needs interpretation" filter: WHERE interpreted_at IS NULL AND status = 'scored'.

The existing title_zh and summary columns already exist in schema.ts. No other schema changes needed.

## Preserve Interpretation Across Re-Collects (CRITICAL)

**Problem:** The current upsertItem() ON CONFLICT clause overwrites title_zh = @title_zh on every collect. Since runCollect() passes title_zh: null, a scheduled re-collect would **destroy all Chinese translations**.

**Fix:** Modify upsertItem() to remove title_zh, summary, and interpreted_at from the ON CONFLICT DO UPDATE SET clause. These three fields are only written by the interpreter, never by the collect pipeline. On INSERT (new item) they take their initial values (title_zh: null, summary: rawItem.summary, interpreted_at: null). On CONFLICT (existing item), they are preserved.

This means re-interpretation does not happen automatically on re-collect (YAGNI for a local tool). Users can manually re-interpret via POST /api/interpret/:id.

## LLM Client (server/src/lib/llm.ts)

Thin wrapper around the Zhipu OpenAI-compatible chat completions endpoint. Owns auth, timeout, response parsing, and typed errors.

```typescript
export type LlmErrorCategory = 'auth' | 'rate_limit' | 'timeout' | 'parse' | 'network' | 'unknown';

export class LlmError extends Error {
  readonly category: LlmErrorCategory;
  readonly statusCode?: number;
}

export interface InterpretResult {
  title_zh: string;
  summary: string;
}

export async function interpretItem(
  item: { title: string; summary: string | null; raw_data: string | null },
  settings: Settings,
): Promise<InterpretResult>;
```

Key behaviors:

- Endpoint: POST {llm_base_url}/chat/completions (OpenAI-compatible)
- Auth: Authorization: Bearer {llm_api_key}
- Timeout: AbortController at llm_timeout_ms (default 30s)
- Model: settings.llm_model (default glm-4-plus)
- Domain safety: open.bigmodel.cn already in http.ts whitelist
- Response: Extract choices[0].message.content, parse as JSON
- Retry: 429 -> exponential backoff (max 2 retries); other errors -> no retry
- API key logging: Never (security red line)

### Prompt design

System message instructs GLM to act as a Chinese tech editor. User message provides the item title + description. The model responds in JSON only.

```
System: You are a Chinese tech editor for an AI tools radar.
Given an item, produce a concise Chinese title (10-25 chars) and a
Chinese summary (50-150 chars) explaining what it is and why it matters.
Respond ONLY as JSON: {"title_zh": "...", "summary": "..."}

User: {"title": "esengine/DeepSeek-Reasonix", "description": "..."}
```

### JSON parsing fallback

If the model wraps JSON in markdown fences or adds prose, the client strips fences and extracts the first {...} block via regex. If parsing still fails, the raw content is stored as summary and title_zh falls back to the original title.

## Interpreter Module (server/src/interpreter/index.ts)

Orchestrates batch and single-item interpretation. Sequential processing with 500ms rate limiter between calls.

```typescript
export interface InterpretRunResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

export async function runInterpretation(limit?: number): Promise<InterpretRunResult>;
export async function interpretSingle(id: string): Promise<InterpretResult>;
```

Batch flow:

1. Read settings.llm_api_key; if empty, return zero result immediately
2. Query uninterpreted items: WHERE interpreted_at IS NULL AND status = 'scored' (limit 50)
3. For each item: call llm.interpretItem() -> updateItemFields(id, { title_zh, summary }) + set interpreted_at
4. 500ms rate limiter between calls
5. Error isolation: one item failure logs + continues; does not abort the batch
6. Logs via logger.info('interpret', ...) with duration per item and totals at end
7. Writes sync_state row for source 'interpret'

### Pipeline integration

In server/src/index.ts runCollect(), after all collectors finish, call runInterpretation() only when settings.llm_api_key is non-empty.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/interpret/run | Batch interpret uninterpreted items (limit query param, default 50) |
| POST | /api/interpret/:id | Interpret a single item by id |

Both return LLM_NOT_CONFIGURED (400) when llm_api_key is empty.

GET /api/health is extended to include uninterpreted_count.

## Frontend Changes

### SettingsPage: LLM configuration section

New form section: API Key (password), Model (text, default glm-4-plus), Base URL (text, default open.bigmodel.cn), Timeout (number, default 30000).

### ItemModal: Chinese display

Show title_zh as primary heading (fallback to item.title). Show Chinese summary from LLM when available.

### FeedPage card: title fallback

Card title shows item.title_zh ?? item.title.

### SystemPage: interpret trigger

Add Run Interpret button. Show uninterpreted_count from health response.

## Degradation

| Condition | Behavior |
|-----------|----------|
| No API key configured | Interpret step skipped entirely, pipeline continues |
| LLM timeout (30s) | Item marked failed, batch continues |
| Rate limit (429) | Backoff retry (max 2), then skip |
| Auth error (401) | Abort batch (all items would fail) |
| JSON parse failure | Store raw LLM output as summary, use original title |
| Partial batch failure | Successful items persisted; failed retry next run |
| LLM service down (5xx) | 2 retries, then skip |

## New / Modified Files

| File | Action | Responsibility |
|------|--------|---------------|
| server/src/lib/llm.ts | New | GLM client: prompt, fetch, parse, typed errors |
| server/src/interpreter/index.ts | New | Batch orchestration, DB updates, sync_state |
| server/src/routes/interpret.ts | New | POST /api/interpret/run, POST /api/interpret/:id |
| server/src/db/migrations.ts | Modify | Add version 2 migration |
| server/src/db/repository.ts | Modify | Preserve title_zh/summary/interpreted_at on conflict; add getUninterpretedItems(); add interpreted_at to updateItemFields |
| server/src/index.ts | Modify | Register interpret routes, call runInterpretation() after collect |
| shared/types.ts | Modify | Add interpreted_at to Item; add 'interpret' to LogCategory; add uninterpreted_count to HealthResponse |
| server/src/routes/health.ts | Modify | Return uninterpreted_count |
| web/src/api/client.ts | Modify | Add interpret.run(), interpret.item(id) |
| web/src/pages/SettingsPage.tsx | Modify | Add LLM config form section |
| web/src/components/ItemModal.tsx | Modify | Show title_zh + Chinese summary |
| web/src/pages/FeedPage.tsx | Modify | Card title fallback to title_zh |
| web/src/pages/SystemPage.tsx | Modify | Add interpret trigger + uninterpreted count |

## Testing Strategy

All tests use mocked fetch responses (no real API calls in CI).

| Test File | Covers |
|-----------|--------|
| server/tests/llm.test.ts | Prompt construction, response parsing, JSON fence stripping, timeout, 401/429 handling, retry |
| server/tests/interpreter.test.ts | Batch flow, error isolation, limit param, no-API-key skip, single-item interpret |
| server/tests/routes-interpret.test.ts | Happy paths, LLM_NOT_CONFIGURED, not-found |

## Acceptance Criteria

1. llm_api_key empty: pipeline runs normally, no interpretation, no errors
2. API key set: collect run auto-interprets new items
3. POST /api/interpret/run interprets a batch of uninterpreted items
4. POST /api/interpret/:id interprets one item and returns result
5. Item modal shows Chinese title + summary when available, falls back gracefully
6. Settings page saves and masks LLM API key
7. System page shows uninterpreted count and has a manual trigger
8. LLM errors degrade gracefully (logged, batch continues)
9. Migration v2 adds interpreted_at column without data loss
10. Existing tests still pass; new interpret tests pass
11. tsc --noEmit clean
12. web build succeeds
