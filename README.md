<p align="center">
  <img src="assets/readme/hero.svg" alt="AI Radar" width="100%">
</p>

<p align="center">
  <strong>Trending AI tools, skills &amp; agents — discovered, scored, and surfaced in one feed.</strong>
</p>

<p align="center">
  <a href="#quick-start"><img alt="Static Badge" src="https://img.shields.io/badge/status-active-9ece6a"></a>
  <a href="#scoring-system"><img alt="Static Badge" src="https://img.shields.io/badge/score-5--dimension-e0af68"></a>
  <a href="#tech-stack"><img alt="Static Badge" src="https://img.shields.io/badge/LLM-Zhipu%20GLM-7dcfff"></a>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-7d8aa8">
</p>

---

AI Radar continuously polls GitHub, Hacker News, and RSS feeds for trending AI projects, tools, and skills. Every item passes through a transparent five-dimension scoring pipeline, gets a Chinese summary via Zhipu GLM, and lands in a clean dark dashboard where you can install qualifying Codex skills in one click.

## Screenshots

<table>
  <tr>
    <td width="50%" align="center"><b>Feed — scored cards with trending</b></td>
    <td width="50%" align="center"><b>Detail modal — translated summary &amp; install</b></td>
  </tr>
  <tr>
    <td><img src="screenshots/feed_main.png" alt="Feed view showing scored AI tool cards" width="100%"></td>
    <td><img src="screenshots/item_modal.png" alt="Item detail modal with Chinese translation and install button" width="100%"></td>
  </tr>
</table>

## Why AI Radar

Most "awesome" lists and trending pages sort by raw star counts, which favors old, already-popular repos and buries fast-rising newcomers. AI Radar uses a weighted multi-signal score so that a 200-star project gaining momentum today can outrank a 50k-star project that went dormant six months ago.

## Architecture

<p align="center">
  <img src="assets/readme/architecture.svg" alt="AI Radar data pipeline architecture" width="100%">
</p>

## Quick Start

```bash
# clone and install
git clone <repo-url> ai-radar
cd ai-radar
npm install

# configure — add your GitHub token and LLM key in the Settings page,
# or set them before first launch
npm run dev        # starts server (:3001) and web (:5173)
```

Open [http://localhost:5173](http://localhost:5173) and go to **Settings** to paste:

- **GitHub Token** — for API rate limits and repo metadata
- **LLM API Key** — Zhipu GLM key for Chinese translation and summaries

```bash
npm test           # vitest unit tests
npm run typecheck  # TypeScript type checking
npm run build      # production build (server + web)
```

## Scoring System

Each item is scored on five normalized dimensions (0–1), then weighted and summed to a 0–100 composite score.

| Dimension | Weight | What it measures |
|---|---|---|
| **Star velocity** | 35% | Daily star growth rate; 3% daily growth hits full score. Falls back to a log scale of absolute stars. |
| **Activity** | 25% | Exponential decay from last push — 30-day half-life. A push today scores 1.0; a 30-day-old push scores 0.5. |
| **Fork ratio** | 15% | Forks-to-stars ratio peaks at 0.05–0.3 (healthy community). Penalized above 0.5 (likely a template). |
| **Author reputation** | 15% | Log scale of the author's most-starred repo: `log(maxStars + 1) / log(100001)`. |
| **Issue health** | 10% | Ratio of closed to total issues — a proxy for maintenance responsiveness. |

Scores are min-max normalized across each batch before weighting, so relative ranking adapts to whatever is currently trending.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Fastify, TypeScript, ESM |
| Database | `node:sqlite` (embedded) |
| Frontend | React, Vite, Tailwind CSS |
| LLM | Zhipu GLM-4-plus (configurable) |
| Testing | Vitest |
| Collectors | GitHub REST API, Hacker News API, RSS feeds |
| Scheduler | Configurable interval (default 6 hours) |

## Data Sources

- **GitHub** — repos matching configurable topics (`ai-agent`, `codex-skill`, `mcp`, `llm`, `rag`, `ai-toolkit`, `prompt-engineering`)
- **Hacker News** — top stories from the "Show HN" and front-page feeds
- **RSS** — blogs and publish feeds (extensible)

Each source type is color-coded throughout the UI (GitHub = green, Hacker News = blue, RSS = purple).

## Install System

Skills and agents discovered by AI Radar can be installed directly into Codex with one click. The install flow includes:

- **Safety scan** — checks for risky patterns before installation
- **Compatibility check** — detects `SKILL.md`, MCP manifests, and standalone apps
- **Codex adapter** — writes skills to `$CODEX_HOME/skills`

## License

MIT