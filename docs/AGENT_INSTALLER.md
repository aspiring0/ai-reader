# Agent Installer Design (V2.4)

## Problem

Current install only copies files to `~/.codex/skills/`. Users want to install
runnable AI agents locally (e.g. DeepSeek-Reasonix) and actually use them.

## Goal

Discover agent -> guided local install -> see real-time progress -> run it.

## Architecture

### 1. Project Type Detection

When a user clicks "Install locally", the system analyzes the repo:

| Signal | Classification | Runtime |
|---|---|---|
| `Dockerfile` or `docker-compose.yml` | Docker | docker |
| `go.mod` + `cmd/` | Go binary | go |
| `package.json` with `bin` field | npm global | node |
| `setup.py` / `pyproject.toml` + `console_scripts` | pip | python |
| `SKILL.md` only | Codex skill | codex-skill (existing) |
| None of above | Manual clone | git |

Detection reads repo file listing via GitHub API (already have `listRepoFiles`).
Priority: Docker > Go > npm > pip > skill > manual.

### 2. Prerequisite Checker

Before installing, check what the user's machine has:

```
POST /api/agent/check-env
  body: { item_id }
  returns: {
    detected_type: "docker" | "go" | "npm" | "pip" | "skill" | "manual",
    prerequisites: [
      { name: "docker", installed: true, version: "24.0.7", path: "C:\\..." },
      { name: "go", installed: false, install_url: "https://go.dev/dl/" },
    ],
    all_met: false,
    blocked_by: ["go"]
  }
```

If prerequisites are missing, the UI shows a guidance panel:
- What is needed (e.g. "Go 1.21+")
- Download link for the user's OS
- After user installs, a "Re-check" button re-runs detection
- Cannot proceed until all prerequisites are met

### 3. Installation Path Manager

Default base path per OS (NOT C:):
- Windows: `%LOCALAPPDATA%\ai-radar\agents\` (e.g. `C:\Users\admin\AppData\Local\ai-radar\agents\`)
- macOS/Linux: `~/.local/share/ai-radar/agents/`

Each agent gets its own subdirectory: `agents/<repo-name>/`.

User can override the base path in Settings AND per-install (the wizard
step 2 has a path input box). The wizard detects available drives:
- Windows: checks C:, D:, E: etc. If D: exists, default to D:\ai-radar\agents\
- macOS/Linux: defaults to ~/.local/share/ai-radar/agents/

The chosen path is remembered as the new default for next install.

### 4. Real-time Installation via SSE

```
POST /api/agent/install
  body: { item_id, install_path }
  returns: stream of SSE events:
    { phase: "clone", message: "Cloning repo..." }
    { phase: "clone", message: "Repository cloned (12.3 MB)" }
    { phase: "build", message: "Running: go build -o reasonix ./cmd/reasonix" }
    { phase: "build", message: "stdout: compiled successfully" }
    { phase: "diagnose", message: "AI: error detected, missing CGO. Fix: set CGO_ENABLED=0" }
    { phase: "done", message: "Installed to .../agents/DeepSeek-Reasonix" }
    { phase: "error", message: "go: command not found" }
```

Backend spawns the install as child process, pipes stdout/stderr to SSE.
Frontend renders a terminal-like output panel with live scrolling.

### 4b. AI-Assisted Error Diagnosis

When an install command exits with non-zero code, the system does NOT just
show an error and stop. Instead:

1. Backend captures full stdout + stderr
2. Sends to the configured LLM with a diagnostic prompt:
   "This command failed: {command}. Output: {stderr}. Suggest a fix."
3. LLM returns: probable cause + specific fix command/config change
4. SSE emits a "diagnose" phase event with the suggestion
5. UI shows both raw error log AND AI suggestion side by side
6. User can click "Apply fix & retry" to re-run with the suggested adjustment

Common scenarios the AI handles:
- Missing env vars (CGO_ENABLED=0, GOPATH not set)
- Docker daemon not running
- npm permission errors (suggest --prefix or nvm)
- Python version mismatch
- Build flags needed for the user's OS

This turns every install failure into a guided troubleshooting session
instead of a dead end.

### 5. Install Steps by Type

#### Docker
1. `git clone <repo> <path>`
2. `docker build -t <name> .`
3. Record: `{ type: "docker", image: "<name>", path: "<path>" }`
4. Suggest run command: `docker run -it <name>`

#### Go
1. `git clone <repo> <path>`
2. `cd <path> && go build -o <name> ./cmd/<name>` (or `./` if no cmd/)
3. Record: `{ type: "binary", binary: "<path>/<name>", path: "<path>" }`
4. Suggest run: `<path>/<name>` or add to PATH

#### npm
1. `npm install -g <package-name>` (if npm package exists)
   OR `git clone` + `npm install` + `npm link`
2. Record: `{ type: "npm-global", command: "<name>" }`
3. Suggest run: `<name>`

#### pip
1. `pip install <package-name>` or `git clone` + `pip install -e .`
2. Record: `{ type: "pip", command: "<name>" }`
3. Suggest run: `<name>`

### 6. Database Schema

New table `installed_agents`:
```sql
CREATE TABLE IF NOT EXISTS installed_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  agent_type TEXT NOT NULL,      -- docker|go|npm|pip|manual
  install_path TEXT NOT NULL,
  run_command TEXT,              -- suggested command to run
  binary_path TEXT,              -- for go/npm: path to executable
  docker_image TEXT,             -- for docker: image name
  installed_at TEXT NOT NULL,
  UNIQUE(agent_name)
);
```

### 7. UI: Install Wizard

Modal flow (3 steps):

Step 1 - Detection: Shows detected project type + prerequisites status.
  Green check = installed, red X = missing (with download link).
  "Next" disabled until all prerequisites met.

Step 2 - Configuration: Shows install path (editable).
  Shows what will happen: "Clone repo -> Build with Go -> Binary at ..."
  Confirm button starts installation.

Step 3 - Installation: Terminal output panel with live SSE stream.
  Shows each phase (clone, build, done).
  On success: shows run command + "Open terminal here" button.
  On error: shows error log + "Retry" button.

### 8. Management

System page shows installed agents (alongside installed skills).
Each agent card shows: name, type, path, run command, installed date.
Uninstall: removes files + DB record.

## File Changes

- `server/src/install/agent-detector.ts` — NEW: detect project type from repo files
- `server/src/install/env-checker.ts` — NEW: check local prerequisites
- `server/src/install/agent-installer.ts` — NEW: run install steps, emit SSE events
- `server/src/routes/agent-install.ts` — NEW: SSE endpoints
- `server/src/db/migrations.ts` — ADD: installed_agents table
- `server/src/db/repository.ts` — ADD: agent CRUD functions
- `web/src/components/AgentInstallModal.tsx` — NEW: 3-step wizard modal
- `web/src/components/InstallLog.tsx` — NEW: terminal output component
- `web/src/pages/SystemPage.tsx` — ADD: installed agents section
- `web/src/api/client.ts` — ADD: agent install API methods

## Existing Codex Skill Install

Stays unchanged. ItemModal shows two buttons:
- "Install as Codex Skill" (existing, for repos with SKILL.md)
- "Install Locally" (new, for runnable agents)
Both visible; user picks based on what they want.
