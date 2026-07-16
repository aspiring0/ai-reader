# AI Radar V2 Product Plan

> Created: 2026-07-16
> Status: Planning (not yet started)

## Overview

V1 (SP1-SP3) built the complete data pipeline: collect, score, translate, install.
V2 shifts focus from "works" to "good product": flexible LLM configuration,
better feed UX, trend visualization, and operational polish.

Each batch is designed to be independently shippable.

---

## V2.0: LLM Multi-Provider System

**Goal:** Let users pick any LLM provider from a dropdown instead of typing URLs.

**Why first:** This is the biggest barrier to adoption. The backend already
supports any OpenAI-compatible provider; the gap is purely UX.

### Tasks

- [ ] Add `llm_provider` field to Settings type
- [ ] Create provider preset registry (name, base_url, model list, auth style)
- [ ] Add `GET /api/llm/providers` endpoint returning available presets
- [ ] Rewrite SettingsPage LLM section: provider dropdown, model dropdown, API key
- [ ] Add "Test Connection" button (sends a 1-token ping, shows green/red)
- [ ] Auto-fill base_url + model when provider changes; allow manual override
- [ ] Domain whitelist update: add new provider domains to http.ts
- [ ] Migration: default existing users to zhipu provider

### Provider Presets

| Provider | Base URL | Default Model |
|---|---|---|
| Zhipu GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-plus` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| Qwen (DashScope) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Ollama (local) | `http://127.0.0.1:11434/v1` | `qwen2.5:7b` |
| Custom | user-defined | user-defined |

---

## V2.1: Feed Experience Upgrade

**Goal:** Make the feed faster to scan and more useful at a glance.

### Tasks

- [ ] Score range filter: slider for min/max score (e.g. "only 70+")
- [ ] Time window filter: "24h / 7d / 30d / all" toggle
- [ ] Card density optimization: score badge + title + 1-line summary + source tag
- [ ] Full-text search: search summary content, not just title
- [ ] Topic/tag filter chips: click a tag to filter by that topic
- [ ] Keyboard navigation: j/k to move between cards, enter to open detail

---

## V2.2: Trend Dashboard

**Goal:** Turn the radar from a list into a visual analytics surface.

### Tasks

- [ ] New Trends page with charts:
  - Daily high-score item count (last 30 days, line chart)
  - Source distribution (GitHub / HN / RSS pie or bar)
  - Top topics word cloud (from collected items)
  - Score distribution histogram
- [ ] Trending tab on FeedPage: items with fastest score growth
- [ ] Weekly digest: auto-generate a "this week in AI" summary

---

## V2.3: Operational Polish

**Goal:** Make the app sustainable for long-term daily use.

### Tasks

- [ ] Data retention policy: auto-prune items older than N days (default 90)
- [ ] RSS feed management UI: add/remove/disable feeds from SettingsPage
- [ ] Export: feed to CSV/JSON for archival or external analysis
- [ ] Notification on new high-score items (in-app badge)
- [ ] CHANGELOG.md catch-up (SP2 + SP3 entries missing)
- [ ] GitHub Actions CI: run vitest + tsc on every push
- [ ] Collection history graph on SystemPage

---

## Priority Order

1. **V2.0** (LLM providers) - highest impact, backend already ready
2. **V2.1** (Feed UX) - daily usability improvement
3. **V2.2** (Trend dashboard) - differentiation feature
4. **V2.3** (Ops polish) - long-term sustainability

Each batch can be done in 1-2 focused sessions.
Desktop deployment (SP4) remains on hold per current decision.
