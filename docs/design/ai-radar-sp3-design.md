# AI Radar SP3 Design: Install System

## 1. Overview

SP3 adds a one-click install pipeline: from an item discovered in the Feed, detect whether it is compatible with the local Codex environment, run a safety scan, and install it to $CODEX_HOME/skills/.

This is the phase where the gap between discovery and adoption gets bridged. SP1a/SP1b/SP2 built the discovery engine. SP3 makes the discovered items actionable.

## 2. The Compatibility Problem (Critical)

### Why This Problem Exists

ai-radar collects items from GitHub by topic keywords (codex-skill, ai-agent, mcp, llm). The item_type field (skill, agent, project) is assigned based on topics, not on actual repo structure. This means the type label is a hint, not a guarantee.

### Real Data Analysis (from current DB: 65 GitHub items)

| item_type | count | what they actually are | installable as Codex skill? |
|-----------|-------|----------------------|---------------------------|
| skill | 24 | Mix of Codex skills, Claude Code skills, general AI skills | Partially |
| agent | 32 | Agent frameworks, browser automation tools, CLI apps | Mostly NO |
| project | 9 | Claude Code plugins, Cursor rules, general repos | Mostly NO |

### Six Compatibility Tiers

| Tier | Description | Detection Signal | Est. % | Example |
|------|-------------|-----------------|--------|---------|
| A | Codex-native skill (SKILL.md + valid frontmatter + codex topic) | SKILL.md exists, frontmatter valid, topics include codex or codex-skill | ~15% | helloianneo/ian-xiaohei-illustrations |
| B | Claude Code skill (SKILL.md + valid frontmatter, no codex topic) | SKILL.md exists, frontmatter valid, topics include claude-code | ~20% | op7418/guizang-ppt-skill |
| C | Skill-like content but no SKILL.md (needs wrapping) | No SKILL.md, but has .md files with instructions/patterns | ~10% | Various repos with README-based guides |
| D | Agent framework / standalone app (NOT a skill) | No SKILL.md, has package.json or pyproject.toml with CLI entry points | ~40% | esengine/DeepSeek-Reasonix, browser-use/browser-harness |
| E | MCP server (needs different install path) | Has mcp topic, repo contains server code | ~10% | Various |
| F | Other (Cursor rules, prompt templates, etc.) | Topics include cursor-rules or prompt, no SKILL.md | ~5% | DietrichGebert/ponytail |

### Detection Flow

```
User clicks "Install" on a Feed item
        |
        v
[1] GitHub Contents API: check repo root for SKILL.md
        |
        +-- SKILL.md found --> [2] Parse YAML frontmatter (name + description required)
        |                          |
        |                          +-- Valid frontmatter --> [3] Check topics for ecosystem signal
        |                          |                           |
        |                          |                           +-- codex or codex-skill --> Tier A (green)
        |                          |                           +-- claude-code            --> Tier B (yellow)
        |                          |                           +-- neither                  --> Tier B (yellow, assume compatible)
        |                          |
        |                          +-- Invalid frontmatter --> Tier C (needs wrapping)
        |
        +-- No SKILL.md --> [4] Check for MCP signals (topics, package.json scripts)
                                |
                                +-- MCP detected  --> Tier E (redirect: MCP config)
                                +-- No MCP        --> Tier D or F (not installable as skill)
```

### What Happens for Each Tier

| Tier | UI Label | Action Available | Color |
|------|----------|-----------------|-------|
| A | "Ready to install (Codex)" | Install button enabled | Green |
| B | "Compatible (Claude Code format)" | Install button enabled, yellow warning | Yellow |
| C | "Needs wrapping" | "Wrap and Install" button (generates SKILL.md from README) | Orange |
| D | "Not a skill (standalone app)" | Install disabled, link to repo only | Gray |
| E | "MCP Server (manual config)" | Link to MCP setup docs | Blue |
| F | "Incompatible format" | Install disabled, link to repo only | Gray |

## 3. Safety Scan Design

### Threat Model

Codex skills can bundle executable scripts (scripts/ dir). The primary risks:

1. Arbitrary code execution - scripts using child_process, exec, spawn, eval
2. Data exfiltration - scripts making outbound HTTP calls to unknown domains
3. Filesystem damage - scripts writing to paths outside the skill directory
4. Prompt injection - SKILL.md containing instructions that manipulate Codex into unsafe actions

### Scan Pipeline (5 Stages)

**S1: File Inventory Audit**
- List all files, flag binary files (.exe, .dll, .so, .dylib)
- Flag unexpected file types (archives, shell scripts outside scripts/)
- Measure total size (warn if > 5MB)

**S2: Metadata Validation**
- Parse SKILL.md frontmatter
- Verify name (required, <= 64 chars, lowercase-hyphen)
- Verify description (required, non-empty)
- Check for metadata.short-description (recommended)

**S3: Static Pattern Scan** (on all .js/.ts/.py/.sh files)
- Dangerous APIs: child_process, exec, spawn, eval, Function()
- Network calls: fetch, XMLHttpRequest, axios, requests, urllib
- Filesystem writes: fs.writeFile, fs.unlink, os.remove, shutil.rmtree
- Environment access: process.env, os.environ
- Dynamic code: new Function, vm.runInNewContext

**S4: Domain Reference Check**
- Extract URLs/domains from all text files
- Flag non-HTTPS URLs
- Flag domains not in a known-safe list (github.com, raw.githubusercontent.com, openai.com, bigmodel.cn)

**S5: SKILL.md Content Review**
- Check for prompt injection patterns ("ignore previous instructions", "act as", "you are now")
- Flag instructions to access credentials, API keys, or env vars

### Risk Aggregation

| Level | Condition | User Can Install? |
|-------|-----------|-------------------|
| green | 0 issues from S3, no binaries from S1, metadata valid | Yes (one click) |
| yellow | 1-3 issues from S3, or binaries present, or metadata incomplete | Yes (with confirmation dialog) |
| red | >3 issues from S3, or critical patterns (rmtree, exec with user input), or prompt injection in S5 | No (blocked, user can override via API only) |

## 4. Install Mechanism: Three Approaches Compared

### Approach A: Full Git Clone

git clone --depth 1 <repo_url> $CODEX_HOME/skills/<skill-name>/

| Aspect | Detail |
|--------|--------|
| Complexity | Low - single command |
| Completeness | High - gets everything in the repo |
| Attack surface | Large - downloads ALL files including non-skill code |
| Disk usage | High - includes .git, README, tests, examples |
| Update support | Yes - git pull to update |
| Rate limits | No (git protocol, not API) |

### Approach B: Selective API Download

GitHub Contents API --> fetch file tree --> filter SKILL.md + scripts/ + references/ + assets/ --> download each file --> write to $CODEX_HOME/skills/<skill-name>/

| Aspect | Detail |
|--------|--------|
| Complexity | Medium - need tree walk + file download loop |
| Completeness | Medium - only skill-relevant files |
| Attack surface | Small - only skill files, easier to audit |
| Disk usage | Low - no .git, no tests, no unrelated code |
| Update support | Manual (re-download) |
| Rate limits | Yes (GitHub API: 60/hr unauthenticated, 5000/hr with token) |

### Approach C: Plugin Wrap

Download repo --> create .codex-plugin/plugin.json --> wrap as plugin --> install to $CODEX_HOME/plugins/<name>/

| Aspect | Detail |
|--------|--------|
| Complexity | High - need plugin manifest generation + marketplace integration |
| Completeness | High |
| Attack surface | Large - wraps entire repo |
| Disk usage | High |
| Update support | Via marketplace system |
| Rate limits | Depends on source |

### Recommendation: Approach B (Selective Download) with Clone Fallback

**Primary: Approach B** - for Tier A/B items where SKILL.md exists, selectively download only the skill directory structure. This minimizes attack surface and disk usage.

**Fallback: Approach A** - when the repo structure is complex (nested directories, many files), or when the user explicitly requests "full clone", fall back to shallow git clone.

**Never: Approach C** - plugin wrapping is overkill for individual skill installs. Reserved for SP4.

## 5. API Design

### New Endpoints

POST /api/install/check/:itemId
  Triggers compatibility detection + safety scan
  Returns: { compatibility_tier, scan_result, installable }

POST /api/install/run
  Body: { itemId, force }
  Runs install (after check has passed or force=true)
  Returns: { ok, skill_path, warnings }

GET /api/install/status
  Lists all installed skills (scans $CODEX_HOME/skills/)
  Returns: { installed: [{ name, path, installed_at }] }

DELETE /api/install/:skillName
  Removes skill from $CODEX_HOME/skills/
  Returns: { ok }

### Caching

The /check endpoint makes GitHub API calls. Cache results per item for 1 hour to avoid repeated scans.

## 6. DB Changes

### Migration v3

CREATE TABLE IF NOT EXISTS installed_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  skill_path TEXT NOT NULL,
  install_method TEXT,
  scan_level TEXT,
  installed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(skill_name)
);

No changes to the items table. Compatibility tier and scan results are transient (computed on demand, cached in memory).

## 7. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Arbitrary code in scripts | S3 static pattern scan flags all executable APIs |
| Prompt injection in SKILL.md | S5 content review flags manipulation patterns |
| Path traversal in download | All paths resolved relative to $CODEX_HOME/skills/, reject .. |
| Large repos causing DoS | File count limit (200), total size limit (10MB), depth limit (5) |
| Malicious binaries | S1 flags all binary file types |
| Skill overwriting existing | UNIQUE constraint on skill_name, UI confirmation for overwrite |

### Path Safety

All file paths must resolve within the target skill directory:

const targetDir = path.join(process.env.CODEX_HOME, 'skills', skillName);
const resolved = path.resolve(targetDir, relativePath);
if (!resolved.startsWith(path.resolve(targetDir))) {
  throw new Error('Path traversal detected');
}

## 8. Frontend Integration

### Feed Card Changes

Add an "Install" button to each Tier A/B card. Button shows a small compatibility badge:
- Green checkmark: Tier A (ready to install)
- Yellow circle: Tier B (compatible with warning)
- Gray dot: Tier C-F (not directly installable, click for details)

### Install Modal (New Component)

When user clicks Install:
1. Show compatibility detection result (tier, scan summary)
2. Show safety scan report (file inventory, risk findings)
3. For green: single "Confirm Install" button
4. For yellow: warning list + "Install Anyway" button
5. For red: blocked message + "I understand, force install" (requires typing skill name)
6. Progress bar during download + install

### SystemPage: Installed Skills Tab

New tab showing all installed skills with uninstall buttons and last scanned timestamps.

## 9. Phased Task Breakdown

### Phase 1: Compatibility Detector + Safety Scanner (Backend)

- T3.1: Write server/tests/compatibility.test.ts - mock GitHub Contents API, test all 6 tier detections
- T3.2: Implement server/src/install/compatibility.ts - SKILL.md detection, frontmatter parsing, tier classification
- T3.3: Write server/tests/safety.test.ts - test pattern matching, domain check, risk aggregation
- T3.4: Implement server/src/install/safety.ts - 5-stage scan pipeline (S1-S5)
- Commit: feat(sp3): compatibility detector + safety scanner

### Phase 2: Install Engine (Backend)

- T3.5: Write server/tests/installer.test.ts - test selective download, path safety, clone fallback
- T3.6: Implement server/src/install/installer.ts - GitHub Contents API download, file write, clone fallback
- T3.7: DB migration v3 (installed_skills table)
- T3.8: Repository functions (insertInstalledSkill, queryInstalledSkills, deleteInstalledSkill)
- Commit: feat(sp3): install engine + installed_skills table

### Phase 3: API Routes

- T3.9: Write route tests (check, run, status, delete)
- T3.10: Implement server/src/routes/install.ts
- T3.11: Wire routes into Fastify server (index.ts)
- Commit: feat(sp3): install API routes

### Phase 4: Frontend Integration

- T3.12: InstallButton component with compatibility badge
- T3.13: InstallModal component (scan report, confirmation, progress)
- T3.14: SystemPage "Installed Skills" tab
- T3.15: API client methods for install endpoints
- Commit: feat(sp3): frontend install integration

### Phase 5: Integration and Review

- T3.16: End-to-end test: discover -> check -> scan -> install -> verify in $CODEX_HOME
- T3.17: Code review (security focus: path safety, scan completeness)
- T3.18: Update PROGRESS.md, CHANGELOG.md
- Commit: chore: sp3 complete

## 10. Out of Scope

- MCP server installation (Tier E items get a link to docs only)
- Plugin wrapping (reserved for SP4)
- Auto-update installed skills (manual re-install only)
- Sandboxed execution (pre-install scan only, not runtime sandboxing)
- Cross-platform runtime verification (detects presence but does not verify runtime)
