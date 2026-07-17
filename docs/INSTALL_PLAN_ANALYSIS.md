# V2.5.1 Feature: LLM-Powered Install Plan Analysis

## Problem

The current install detection is pure file-name matching: if there's a
`go.mod`, it runs `go build -o xxx .`. But real repos often need:
- Specific build flags (CGO_ENABLED=0)
- Environment variables (GOPATH, PYTHONPATH)
- Config files before first run
- A different build command than the default (makefile, not direct go build)

The file-name matcher has no way to know this. The README usually says.

## Goal

When a user opens the install wizard, the system:
1. Fetches the repo's README.md (+ file listing)
2. Sends to LLM via the unified `llmChat()`
3. LLM returns a structured install plan with real commands + notes
4. Wizard step 1 shows the AI plan instead of just "detected: go"
5. Fallback: if no LLM configured, use current `detectAgentType()`

## Design

### New file: `server/src/install/install-analyzer.ts`

```typescript
export interface InstallStep {
  command: string;       // e.g. "git clone ..." or "go build -o xxx ."
  description: string;   // human-readable explanation
}

export interface InstallPlan {
  project_type: string;         // docker|go|npm|pip|manual
  summary: string;              // 1-2 sentence project description
  prerequisites: string[];      // ["Go 1.21+", "Docker"]
  steps: InstallStep[];         // ordered build/run commands
  run_command: string;          // how to run after install
  notes: string[];              // warnings, config tips, gotchas
  confidence: number;           // 0-1, how sure the LLM is
}

/**
 * Analyze a GitHub repo's README + file list with LLM to produce
 * a structured install plan. Falls back to detectAgentType() if LLM
 * is not configured.
 */
export async function analyzeInstallPlan(
  repoFullName: string,
  fileNames: string[],
  token?: string,
): Promise<InstallPlan>
```

**Prompt design**: System message tells the LLM to act as a DevOps engineer,
analyze the README and file listing, and respond ONLY as structured JSON.
User message contains the repo name, file list, and README content.

**README fetch**: `https://raw.githubusercontent.com/{repo}/HEAD/README.md`
Case-insensitive: try `README.md`, `readme.md`, `README.rst`, `README.txt`.
Cap README at 4000 chars to stay within token budget.

**Fallback**: if `settings.llm_api_key` is empty, or `llmChat()` throws,
return a plan derived from `detectAgentType()` (current behavior, no LLM).

### Route change: `server/src/routes/agent-install.ts`

`POST /api/agent/check-env` response gains an optional `install_plan` field:
```json
{
  "detected_type": "go",
  "prerequisites": [...],
  "all_met": true,
  "is_skill": false,
  "install_plan": {
    "project_type": "go",
    "summary": "A distributed task queue for Go",
    "prerequisites": ["Go 1.21+"],
    "steps": [{"command": "go build -o myapp ./cmd/myapp", "description": "..."}],
    "run_command": "./myapp",
    "notes": ["Requires Redis for task broker"],
    "confidence": 0.85
  }
}
```
If LLM not configured, `install_plan` is null (graceful degradation).

### Frontend: `AgentInstallModal.tsx`

Step 1 gains an "AI 安装计划" card (when `install_plan` is present):
- Summary line
- Prerequisites chips
- Ordered step list (command in monospace + description)
- Notes (warnings)
- Confidence badge

Step 2 "将要执行" summary uses the plan's steps instead of the
hardcoded `buildSummary()` function.

Step 3 install: when a plan exists, `runAgentInstall()` should use the
plan's build commands instead of the detection-based defaults.

### Engine change: `agent-installer.ts`

`runAgentInstall()` gains optional `plan?: InstallPlan` parameter.
If provided, uses `plan.steps` for build commands instead of the
type-based switch statement.

## TDD Plan

### Phase 1: Tests for install-analyzer.ts (NEW)
- `server/tests/install-analyzer.test.ts`:
  - should return structured plan from valid LLM JSON response
  - should parse steps, prerequisites, notes from LLM output
  - should fallback to detectAgentType when LLM key not configured
  - should fallback when llmChat throws
  - should cap README at 4000 chars
  - should handle missing README gracefully
  - should strip markdown fences from LLM JSON

### Phase 2: Implement install-analyzer.ts until tests pass

### Phase 3: Route change (add install_plan to check-env response)

### Phase 4: Engine change (runAgentInstall uses plan.steps when available)

### Phase 5: Frontend (AgentInstallModal shows AI plan in step 1+2)

### Phase 6: Full suite green, typecheck, commit, merge, push

## Non-Goals
- Editable steps (defer to V2.5.2)
- Conversational troubleshooting (defer to V2.5.3)
- Multi-model selection per task (defer to V2.5.4)