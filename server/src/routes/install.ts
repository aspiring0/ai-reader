import type { FastifyInstance } from 'fastify';
import { getItemById } from '../db/repository.js';
import {
  queryInstalledSkills,
  deleteInstalledSkill,
  insertInstalledSkill,
} from '../db/repository.js';
import { classifyCompatibility } from '../install/compatibility.js';
import type { CompatibilityResult } from '../install/compatibility.js';
import { runSafetyScan } from '../install/safety.js';
import { installSkill, listRepoFiles } from '../install/installer.js';
import { getSettings } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { ok, fail } from './helpers.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ai-radar',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function installRoutes(app: FastifyInstance): Promise<void> {
  /** List all installed skills. */
  app.get('/api/install/status', async (_req, reply) => {
    const installed = queryInstalledSkills();
    return ok(reply, { installed });
  });

  /** Delete an installed skill (DB record + filesystem). */
  app.delete<{ Params: { skillName: string } }>(
    '/api/install/:skillName',
    async (req, reply) => {
      const { skillName } = req.params;
      const existing = queryInstalledSkills().find((s) => s.skill_name === skillName);
      if (!existing) {
        return fail(reply, 'NOT_FOUND', `Skill not found: ${skillName}`, 404);
      }
      const expectedBase = path.join(
        process.env.CODEX_HOME || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.codex'),
        'skills',
      );
      const resolvedPath = path.resolve(existing.skill_path);
      const resolvedBase = path.resolve(expectedBase);
      if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
        logger.error('install', 'uninstall', `Rejected delete outside skills dir: ${existing.skill_path}`);
        return fail(reply, 'FORBIDDEN', 'Skill path is outside the allowed directory', 403);
      }
      if (resolvedPath && fs.existsSync(resolvedPath)) {
        fs.rmSync(resolvedPath, { recursive: true, force: true });
        logger.info('install', 'uninstall', `Removed ${existing.skill_path}`);
      }
      deleteInstalledSkill(skillName);
      return ok(reply, { deleted: skillName });
    },
  );

  /** Check compatibility + run safety scan for an item (before install).
   * Uses wildcard param because item IDs contain slashes (e.g. github:owner/repo). */
  app.post<{ Params: { '*': string } }>(
    '/api/install/check/*',
    async (req, reply) => {
      const itemId = req.params['*'];
      const item = getItemById(itemId);
      if (!item) {
        return fail(reply, 'NOT_FOUND', `Item not found: ${itemId}`, 404);
      }

      let topics: string[] = [];
      let description = '';
      try {
        const rd = item.raw_data ? JSON.parse(item.raw_data) : {};
        topics = rd.topics ?? [];
        description = rd.description ?? '';
      } catch {
        // keep defaults
      }

      const repoFullName = item.source_id;
      const settings = getSettings();
      const token = settings.github_token || undefined;

      let compat: CompatibilityResult;
      let scanResult = null;
      try {
        // listRepoFiles tries Git Trees API first (more reliable recursive), then Contents API
        const files = await listRepoFiles(repoFullName, token);

        const compatFiles = files.map((f) => ({
          name: f.path.split('/').pop() ?? f.path,
          type: f.type,
          path: f.path,
        }));

        // Find SKILL.md path (root or nested) by checking file listing
        const skillMdFile = compatFiles.find(f => f.name === 'SKILL.md');
        const skillMdPath = skillMdFile ? skillMdFile.path : null;

        // Fetch SKILL.md content if it exists anywhere in the tree
        let skillMdContent: string | null = null;
        if (skillMdPath) {
          const rawUrl = `https://raw.githubusercontent.com/${repoFullName}/HEAD/${skillMdPath}`;
          try {
            const rawResp = await fetch(rawUrl, { headers: ghHeaders(token) });
            if (rawResp.ok) skillMdContent = await rawResp.text();
          } catch {
            // continue without SKILL.md content
          }
        }

        // Single-pass classification with actual content
        compat = await classifyCompatibility(
          compatFiles,
          { topics, fullName: repoFullName, url: item.url, description },
          async () => skillMdContent,
        );

        // Safety scan: only scan files within the skill subdir
        const subdir = compat.skillDir ?? '';
        const scanFiles = files
          .filter((f) => {
            if (!subdir) return true;
            const prefix = subdir.endsWith('/') ? subdir : subdir + '/';
            return f.path === subdir || f.path.startsWith(prefix);
          })
          .map((f) => ({ path: f.path, content: '', size: f.size ?? 0 }));

        if (skillMdContent) {
          const mdPath = subdir ? `${subdir}/SKILL.md` : 'SKILL.md';
          const skillFile = scanFiles.find((f) => f.path === mdPath);
          if (skillFile) {
            skillFile.content = skillMdContent;
            skillFile.size = skillMdContent.length;
          } else {
            scanFiles.push({ path: mdPath, content: skillMdContent, size: skillMdContent.length });
          }
        }
        scanResult = runSafetyScan(scanFiles);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('install', 'check', `GitHub API failed for ${repoFullName}: ${msg}`);
        compat = {
          tier: 'D',
          installable: false,
          skillName: null,
          skillDescription: null,
          skillDir: null,
          label: 'Unable to fetch repo',
          reason: 'GitHub API call failed',
        };
      }

      return ok(reply, {
        compatibility: compat,
        scan: scanResult,
        installable: compat.installable && scanResult !== null && scanResult.riskLevel !== 'red',
      });
    },
  );

  /** Run the install for an item. */
  app.post<{ Body: { itemId?: string; method?: string } }>(
    '/api/install/run',
    async (req, reply) => {
      const { itemId } = req.body ?? {};
      if (!itemId) {
        return fail(reply, 'BAD_REQUEST', 'itemId is required', 400);
      }

      const item = getItemById(itemId);
      if (!item) {
        return fail(reply, 'NOT_FOUND', `Item not found: ${itemId}`, 404);
      }

      const settings = getSettings();
      const codexHome = process.env.CODEX_HOME || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.codex');
      const repoFullName = item.source_id;
      const rawSkillName = (item.raw_data ? safeParseSkillName(item.raw_data) : null) ?? item.source_id.replace('/', '-');
      const skillName = rawSkillName.replace(/[^\w.-]/g, '-').replace(/^\.+/, '');
      const token = settings.github_token || undefined;

      // Detect skill subdir so we install from the right place
      let skillSubdir: string | undefined;
      try {
        const files = await listRepoFiles(repoFullName, token);
        const compatFiles = files.map((f) => ({
          name: f.path.split('/').pop() ?? f.path,
          type: f.type,
          path: f.path,
        }));
       // Find SKILL.md path to determine subdir
       const skillMdFile = compatFiles.find(f => f.name === 'SKILL.md');
       if (skillMdFile && skillMdFile.path.includes('/')) {
         skillSubdir = skillMdFile.path.substring(0, skillMdFile.path.lastIndexOf('/'));
       }
      } catch {
        // Proceed without subdir detection
      }

      try {
        const result = await installSkill({
          repoFullName,
          skillName,
          codexHome,
          githubToken: token,
          method: (req.body?.method as 'auto' | 'api' | 'clone') || 'auto',
          skillSubdir,
        });

        insertInstalledSkill({
          item_id: itemId,
          skill_name: skillName,
          skill_path: result.skillPath,
          install_method: result.method,
        });

        logger.info('install', 'run', `Installed ${skillName} via ${result.method}${skillSubdir ? ` (subdir: ${skillSubdir})` : ''}`);
        return ok(reply, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('install', 'run', `Install failed for ${skillName}: ${msg}`);
        return fail(reply, 'INSTALL_ERROR', msg, 500);
      }
    },
  );
}

/** Extract a skill name from raw_data SKILL.md frontmatter if available. */
function safeParseSkillName(rawData: string): string | null {
  try {
    const rd = JSON.parse(rawData);
    return rd.name ?? null;
  } catch {
    return null;
  }
}
