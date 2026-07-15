# ADR-003: Zhipu GLM direct API instead of cc-switch proxy

**Date:** 2026-07-15
**Status:** Accepted

## Context

The interpretation layer (SP2) needs an LLM to translate and explain AI news/skills in Chinese. The user's machine runs cc-switch (local model proxy on :15721) which proxies to GLM models. The question is whether to route LLM calls through cc-switch or call the Zhipu API directly.

## Considered Options

1. **cc-switch proxy** (127.0.0.1:15721) - No API key needed (proxy-managed bearer token). Requires cc-switch running.
2. **Zhipu GLM direct API** (open.bigmodel.cn) - Needs API key. No dependency on cc-switch process state. OpenAI-compatible endpoint.

## Decision

Zhipu GLM direct API.

## Rationale

- Eliminates runtime dependency on cc-switch being started/healthy.
- cc-switch may be stopped, restarted, or reconfigured; direct API is more predictable.
- The user already uses GLM models (config.toml shows glm-5.2), so they have Zhipu ecosystem familiarity.
- API key stored in SQLite settings, never plaintext.
- Fallback: if the user prefers cc-switch, they can set `llm_base_url` to `http://127.0.0.1:15721/v4` in settings.

## Consequences

- User must obtain a Zhipu API key from bigmodel.cn (one-time setup, SP2 concern).
- Settings page needs an API key input field.
- Rate limits are per-Zhipu-account, not per-cc-switch-instance.
