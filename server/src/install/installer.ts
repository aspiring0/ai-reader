/**
 * SP3 Install Engine
 *
 * Selectively downloads Codex-relevant files from a GitHub repo (Approach B),
 * with a shallow git-clone fallback (Approach A) for complex repos.
 *
 * Supports nested skill repos where SKILL.md lives in a subdirectory
 * (e.g. skills/<name>/SKILL.md).
 *
 * Security: all paths are resolved within the target skill directory and
 * path traversal (.. or absolute paths) is rejected.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { logger } from '../lib/logger.js';

// ---- Limits ----
const MAX_FILES = 200;
const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10 MB

// Skill-relevant file/directory patterns (relative to skill root or skill subdir)
const SKILL_PATH_PATTERNS: RegExp[] = [
  /^SKILL\.md$/i,
  /^scripts\//i,
  /^references\//i,
  /^assets\//i,
  /^agents\//i,
  /^README\.md$/i,
];

// ---- Types ----
export interface RepoFile {
  path: string;
  type: 'file' | 'dir';
  download_url: string | null;
  size: number;
}

export type InstallMethod = 'auto' | 'api' | 'clone';

export interface InstallOptions {
  repoFullName: string;
  skillName: string;
  codexHome: string;
  githubToken?: string;
  method?: InstallMethod;
  /** Subdirectory within the repo where the skill lives ('' for root, 'skills/foo' for nested). */
  skillSubdir?: string;
  /** Injectable clone function for testing. */
  gitClone?: (repoUrl: string, targetDir: string) => Promise<void>;
}

export interface InstallResult {
  ok: boolean;
  skillPath: string;
  method: 'api' | 'clone';
  filesWritten: number;
  warnings: string[];
}

// ---- Pure helpers ----

/**
 * Resolve a relative path within targetDir, rejecting traversal.
 * Throws if the resolved path escapes targetDir.
 */
export function safeResolvePath(targetDir: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }
  const cleaned = relativePath.replace(/^\//, '');
  const resolved = path.resolve(targetDir, cleaned);
  const normalizedTarget = path.resolve(targetDir);
  if (resolved !== normalizedTarget && !resolved.startsWith(normalizedTarget + path.sep)) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }
  return resolved;
}

/** Whether a repo file path is relevant to a Codex skill. */
export function isSkillFile(filePath: string): boolean {
  return SKILL_PATH_PATTERNS.some((p) => p.test(filePath));
}

/** Strip a directory prefix from a path, returning null if the path doesn't start with it. */
function stripPrefix(filePath: string, prefix: string): string | null {
  if (!prefix) return filePath;
  const p = prefix.endsWith('/') ? prefix : prefix + '/';
  if (filePath === prefix || filePath.startsWith(p)) {
    return filePath.slice(p.length);
  }
  return null;
}

/**
 * Filter repo files to skill-relevant ones, handling nested skill dirs.
 * When skillSubdir is set, only files within that subdir are considered,
 * and the subdir prefix is stripped to give the local path.
 */
export function filterSkillFiles(
  files: RepoFile[],
  skillSubdir?: string,
): { selected: { file: RepoFile; localPath: string }[]; skipped: number } {
  const subdir = skillSubdir ?? '';
  const selected: { file: RepoFile; localPath: string }[] = [];
  let skipped = 0;

  for (const f of files) {
    if (f.type !== 'file') {
      skipped++;
      continue;
    }
    const localPath = subdir ? stripPrefix(f.path, subdir) : f.path;
    if (localPath === null) {
      skipped++;
      continue;
    }
    if (isSkillFile(localPath)) {
      selected.push({ file: f, localPath });
    } else {
      skipped++;
    }
  }

  return { selected, skipped };
}

// ---- GitHub API helpers ----

/** Build auth headers for GitHub API calls. */
function githubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ai-radar',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * List all files in a repo. Tries the Git Trees API first (more reliable for
 * recursive listings), then falls back to the Contents API.
 */
export async function listRepoFiles(repoFullName: string, token?: string): Promise<RepoFile[]> {
  // Try Git Trees API with default branch
  try {
    const treesUrl = `https://api.github.com/repos/${repoFullName}/git/trees/HEAD?recursive=1`;
    const treesResp = await fetch(treesUrl, { headers: githubHeaders(token) });
    if (treesResp.ok) {
      const treesData = (await treesResp.json()) as {
        tree: { path: string; type: string; size?: number }[];
      };
      if (treesData.tree && treesData.tree.length > 0) {
        return treesData.tree
          .filter((e) => e.type === 'blob')
          .map((e) => ({
            path: e.path,
            type: 'file' as const,
            download_url: `https://raw.githubusercontent.com/${repoFullName}/HEAD/${e.path}`,
            size: e.size ?? 0,
          }));
      }
    }
  } catch {
    // Fall through to Contents API
  }

  // Fallback: Contents API (recursive)
  const url = `https://api.github.com/repos/${repoFullName}/contents?recursive=1`;
  const resp = await fetch(url, { headers: githubHeaders(token) });
  if (!resp.ok) {
    throw new Error(`GitHub API failed (${resp.status})`);
  }
  const data = (await resp.json()) as RepoFile[];
  return data.filter((f) => f && typeof f.path === 'string');
}

// ---- Clone fallback ----

/** Shallow-clone a repo into targetDir using git. */
export async function gitCloneRepo(repoUrl: string, targetDir: string): Promise<void> {
  const parent = path.dirname(targetDir);
  fs.mkdirSync(parent, { recursive: true });
  fs.rmSync(targetDir, { recursive: true, force: true });
  execFileSync('git', ['clone', '--depth', '1', repoUrl, targetDir], {
    stdio: 'pipe',
    timeout: 30000,
  });
}

// ---- Main entry point ----

/**
 * Install a skill from a GitHub repo into $CODEX_HOME/skills/<skillName>/.
 *
 * When skillSubdir is set, only files within that subdirectory are downloaded,
 * preserving the internal structure (SKILL.md goes to the root of the target).
 *
 * Strategy:
 *  - method 'api':   selective download only
 *  - method 'clone': shallow git clone only
 *  - method 'auto':  try API first; fall back to clone if file count exceeds
 *                    MAX_FILES or total size exceeds MAX_TOTAL_SIZE
 */
export async function installSkill(opts: InstallOptions): Promise<InstallResult> {
  const { repoFullName, skillName, codexHome, githubToken } = opts;
  const method: InstallMethod = opts.method ?? 'auto';
  const subdir = opts.skillSubdir ?? '';
  const skillDir = safeResolvePath(path.join(codexHome, 'skills'), skillName);
  const warnings: string[] = [];

  const cloneFn = opts.gitClone ?? gitCloneRepo;
  const repoUrl = `https://github.com/${repoFullName}.git`;

  // Explicit clone
  if (method === 'clone') {
    await cloneFn(repoUrl, skillDir);
    return { ok: true, skillPath: skillDir, method: 'clone', filesWritten: countFiles(skillDir), warnings };
  }

  // List repo files
  const files = await listRepoFiles(repoFullName, githubToken);

  // Filter to skill-relevant files within the subdir
  const { selected, skipped } = filterSkillFiles(files, subdir);
  const totalSize = selected.reduce((sum, s) => sum + s.file.size, 0);

  if (method === 'auto' && (files.length > MAX_FILES || totalSize > MAX_TOTAL_SIZE)) {
    logger.warn('install', skillName, `Falling back to clone: ${files.length} files, ${totalSize} bytes`);
    await cloneFn(repoUrl, skillDir);
    return { ok: true, skillPath: skillDir, method: 'clone', filesWritten: countFiles(skillDir), warnings };
  }

  if (method === 'auto' && skipped > 0) {
    warnings.push(`${skipped} non-skill files skipped`);
  }

  // Selective download
  fs.mkdirSync(skillDir, { recursive: true });
  let filesWritten = 0;

  for (const { file, localPath } of selected) {
    const targetPath = safeResolvePath(skillDir, localPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    if (!file.download_url) {
      warnings.push(`No download_url for ${file.path}, skipped`);
      continue;
    }

    const resp = await fetch(file.download_url, { headers: githubHeaders(githubToken) });
    if (!resp.ok) {
      warnings.push(`Failed to download ${file.path} (${resp.status})`);
      continue;
    }

    const content = await resp.text();
    fs.writeFileSync(targetPath, content);
    filesWritten++;
  }

  logger.info('install', skillName, `Installed via API: ${filesWritten} files (subdir: ${subdir || 'root'})`);
  return { ok: true, skillPath: skillDir, method: 'api', filesWritten, warnings };
}

/** Count files in a directory recursively. */
function countFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(fullPath);
    } else {
      count++;
    }
  }
  return count;
}
