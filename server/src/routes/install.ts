import type { FastifyInstance } from 'fastify';
import { getItemById } from '../db/repository.js';
import {
  queryInstalledSkills,
  deleteInstalledSkill,
  insertInstalledSkill,
} from '../db/repository.js';
import { classifyCompatibility } from '../install/compatibility.js';
import { runSafetyScan } from '../install/safety.js';
import { installSkill } from '../install/installer.js';
import { getSettings } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { ok, fail } from './helpers.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
      // Remove from filesystem if the path still exists
      if (existing.skill_path && fs.existsSync(existing.skill_path)) {
        fs.rmSync(existing.skill_path, { recursive: true, force: true });
        logger.info('install', 'uninstall', `Removed ${existing.skill_path}`);
      }
      deleteInstalledSkill(skillName);
      return ok(reply, { deleted: skillName });
    },
  );

  /** Check compatibility + run safety scan for an item (before install). */
  app.post<{ Params: { itemId: string } }>(
    '/api/install/check/:itemId',
    async (req, reply) => {
      const item = getItemById(req.params.itemId);
      if (!item) {
        return fail(reply, 'NOT_FOUND', `Item not found: ${req.params.itemId}`, 404);
      }

      // Parse repo metadata from raw_data
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

      // Fetch repo file listing via GitHub Contents API
      let compat;
      let scanResult = null;
      try {
        const apiUrl = `https://api.github.com/repos/${repoFullName}/contents?recursive=1`;
        const resp = await fetch(apiUrl, {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'ai-radar',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        const ghFiles: { name: string; type: string; path: string }[] = resp.ok ? await resp.json() as { name: string; type: string; path: string }[] : [];

        // Fetch SKILL.md content if present
        const skillMdEntry = ghFiles.find((f) => f.name === 'SKILL.md');
        let skillMdContent: string | null = null;
        if (skillMdEntry) {
          const rawUrl = `https://raw.githubusercontent.com/${repoFullName}/HEAD/SKILL.md`;
          const rawResp = await fetch(rawUrl, {
            headers: { 'User-Agent': 'ai-radar', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          });
          if (rawResp.ok) skillMdContent = await rawResp.text();
        }

        compat = await classifyCompatibility(
          ghFiles,
          { topics, fullName: repoFullName, url: item.url, description },
          async () => skillMdContent,
        );

        // Run safety scan on the listed files (use sizes from listing if available)
        const scanFiles = ghFiles
          .filter((f) => f.type === 'file')
          .map((f) => ({ path: f.path, content: '', size: 0 }));
        if (skillMdContent) {
          const skillFile = scanFiles.find((f) => f.path === 'SKILL.md');
          if (skillFile) {
            skillFile.content = skillMdContent;
            skillFile.size = skillMdContent.length;
          }
        }
        scanResult = runSafetyScan(scanFiles);
      } catch {
        // GitHub API failed — return a minimal result
        compat = {
          tier: 'D' as const,
          installable: false,
          skillName: null,
          skillDescription: null,
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
      const skillName = (item.raw_data ? safeParseSkillName(item.raw_data) : null) ?? item.source_id.replace('/', '-');
      const token = settings.github_token || undefined;

      try {
        const result = await installSkill({
          repoFullName,
          skillName,
          codexHome,
          githubToken: token,
          method: (req.body?.method as 'auto' | 'api' | 'clone') || 'auto',
        });

        insertInstalledSkill({
          item_id: itemId,
          skill_name: skillName,
          skill_path: result.skillPath,
          install_method: result.method,
        });

        logger.info('install', 'run', `Installed ${skillName} via ${result.method}`);
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
