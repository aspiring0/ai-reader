# V2.5 Refactor: Unified LLM Client

## Problem

Three separate codebases call the LLM API, each reimplementing
`AbortController + setTimeout + fetch` independently:

1. `server/src/lib/llm.ts` — `interpretItem()`: full retry/backoff/error
   classification (most mature, 7 tests)
2. `server/src/routes/llm.ts` — `fetchModels()` + `testConnection()`:
   no retry, bare abort, returns soft errors
3. `server/src/install/agent-installer.ts` — `diagnoseError()`: no
   retry, bare abort, returns null on failure

This means: diagnoseError and fetchModels have zero retry capability,
and adding any new LLM feature means writing a 4th copy.

## Goal

Extract a single `llmChat()` function that all LLM callers inherit.
Zero behavior change for existing callers. TDD: write tests first.

## Design

### New file: `server/src/lib/llm-client.ts`

```typescript
import type { Settings } from '@shared/types';
import { isLlmEndpoint } from './http.js';
import { LlmError } from './llm.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmChatOptions {
  messages: ChatMessage[];
  temperature?: number;    // default 0.3
  maxTokens?: number;      // default undefined (provider default)
  timeoutMs?: number;      // default settings.llm_timeout_ms
  maxRetries?: number;     // default 2
  // Override settings (for test-connection which uses unsaved creds)
  baseUrlOverride?: string;
  apiKeyOverride?: string;
  modelOverride?: string;
}

export interface LlmChatResult {
  content: string;         // raw text from choices[0].message.content
  model: string;           // the model used
}

/**
 * Core LLM chat call with retry, backoff, timeout, and error classification.
 * Throws LlmError on failure. All other LLM functions delegate here.
 */
export async function llmChat(
  opts: LlmChatOptions,
  settings: Settings,
): Promise<LlmChatResult>
```

**Retry logic** (moved from interpretItem, generalized):
- 401/403 -> throw LlmError('auth') immediately, no retry
- 429 -> retry with exponential backoff (1s, 2s, 4s)
- 5xx -> retry with exponential backoff
- AbortError -> retry as 'timeout'
- Other errors -> retry as 'network'
- Exhaust retries -> throw lastError

**Endpoint resolution**:
- Default: `settings.llm_base_url + '/chat/completions'`
- Override: `opts.baseUrlOverride + '/chat/completions'`
- Validation: `isLlmEndpoint()` check

### Refactored: `server/src/lib/llm.ts`

`interpretItem()` becomes a thin wrapper:
1. Build system + user messages (prompt logic stays here)
2. Call `llmChat(messages, settings)`
3. Parse JSON from response content (extractJson stays here)
4. Return InterpretResult

The `extractJson`, `SYSTEM_PROMPT`, and `InterpretResult` stay in llm.ts
because they are interpretation-specific, not generic LLM concerns.

`LlmError` and `LlmErrorCategory` stay in llm.ts (re-exported from
llm-client.ts to avoid circular deps — actually, move them to llm-client.ts
and have llm.ts import from there).

### Refactored: `server/src/routes/llm.ts`

`testConnection()` becomes:
1. Call `llmChat({ messages: [{role:'user', content:'hi'}], maxTokens: 1,
   baseUrlOverride, apiKeyOverride, modelOverride, timeoutMs: 10000 })`
2. Wrap result in `{ success: true, message }`
3. Catch LlmError -> map category to user message

`fetchModels()` stays mostly as-is (it hits /models not /chat/completions,
different endpoint shape), but uses a shared `llmFetch()` helper for the
abort/timeout/error handling.

### Refactored: `server/src/install/agent-installer.ts`

`diagnoseError()` becomes:
1. Build diagnostic prompt (stays here)
2. Call `llmChat({ messages, maxTokens: 300, timeoutMs: 15000 })`
3. Catch LlmError -> return null (diagnosis is best-effort)

## Circular Dependency Handling

Current: `llm.ts` imports from `http.ts`
New: `llm-client.ts` imports from `http.ts`, `llm.ts` imports from
`llm-client.ts`. No cycle.

`LlmError` moves to `llm-client.ts`. `llm.ts` re-exports it for
backward compatibility (existing imports `import { LlmError } from
'../lib/llm.js'` still work).

## TDD Plan

### Phase 1: Write tests for llm-client.ts (NEW test file)
- `server/tests/llm-client.test.ts`:
  - should return content on successful call
  - should send correct headers (Authorization Bearer)
  - should send correct body (model, messages, temperature, max_tokens)
  - should use override base URL / API key / model when provided
  - should retry on 429 then succeed
  - should retry on 5xx then succeed
  - should NOT retry on 401 (immediate throw)
  - should throw LlmError with correct category on exhaustion
  - should respect timeoutMs override
  - should call isLlmEndpoint and reject non-HTTPS non-localhost

### Phase 2: Implement llm-client.ts until tests pass

### Phase 3: Refactor llm.ts (interpretItem delegates to llmChat)
- Existing `llm.test.ts` (7 tests) must still pass unchanged
- No behavior change

### Phase 4: Refactor routes/llm.ts (testConnection delegates to llmChat)
- Existing route tests must still pass
- testConnection gains retry capability (improvement, not regression)

### Phase 5: Refactor agent-installer.ts (diagnoseError delegates to llmChat)
- diagnoseError gains retry capability
- No new test file needed (diagnose is best-effort, returns null on fail)

### Phase 6: Full test suite green, typecheck clean, commit, PR

## File Changes

| File | Action |
|---|---|
| `server/src/lib/llm-client.ts` | NEW: core llmChat() + LlmError (moved) |
| `server/tests/llm-client.test.ts` | NEW: 10 tests |
| `server/src/lib/llm.ts` | MODIFY: interpretItem delegates to llmChat, re-export LlmError |
| `server/src/routes/llm.ts` | MODIFY: testConnection delegates to llmChat |
| `server/src/install/agent-installer.ts` | MODIFY: diagnoseError delegates to llmChat |

## Non-Goals (deferred to separate PRs)

- LLM-powered install plan analysis (V2.5.1)
- Semantic dedup (V2.5.2)
- Quality scoring dimension (V2.5.3)
- Multi-model / multi-agent config (V2.5.4)

This refactor is the foundation that makes all of those cheap to build.