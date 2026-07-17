import type { FastifyInstance } from 'fastify';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getItemById, queryInstalledAgents, deleteInstalledAgent, getInstalledAgent } from '../db/repository.js';
import { checkItemEnv, getDefaultPath, runAgentInstall, type InstallEvent } from '../install/agent-installer.js';
import { ok, fail } from './helpers.js';
import { logger } from '../lib/logger.js';

/** Basic path-safety check: must be absolute and not a system directory. */
function isSafeInstallPath(p: string): boolean {
  if (!p || !path.isAbsolute(p)) return false;
  const lower = path.resolve(p).toLowerCase();
  const blocked = ['c:\\windows', 'c:\\program files', 'c:\\program files (x86)', 'c:\\system32'];
  return !blocked.some((b) => lower === b || lower.startsWith(b + path.sep));
}

export async function agentInstallRoutes(app: FastifyInstance): Promise<void> {
  /** Detect project type + check prerequisites. */
  app.post<{ Body: { item_id?: string } }>(
    '/api/agent/check-env',
    async (req, reply) => {
      const itemId = req.body?.item_id;
      if (!itemId) {
        return fail(reply, 'BAD_REQUEST', 'item_id is required', 400);
      }
      const item = getItemById(itemId);
      if (!item) {
        return fail(reply, 'NOT_FOUND', 'Item not found: ' + itemId, 404);
      }
      try {
        const env = await checkItemEnv(itemId);
        return ok(reply, {
          detected_type: env.detected_type,
          prerequisites: env.prerequisites,
          all_met: env.all_met,
          blocked_by: env.blocked_by,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('install', 'agent-check-env', 'Failed: ' + msg);
        return fail(reply, 'DETECT_ERROR', msg, 500);
      }
    },
  );

  /** Return default install path + available drives. */
  app.get('/api/agent/default-path', async (_req, reply) => {
    return ok(reply, getDefaultPath());
  });

  /** Run install as SSE stream. */
  app.post<{ Body: { item_id?: string; install_path?: string } }>(
    '/api/agent/install',
    async (req, reply) => {
      const itemId = req.body?.item_id;
      const installPath = req.body?.install_path;
      if (!itemId) {
        return fail(reply, 'BAD_REQUEST', 'item_id is required', 400);
      }
      if (!installPath || !isSafeInstallPath(installPath)) {
        return fail(reply, 'BAD_REQUEST', 'Invalid or unsafe install_path', 400);
      }
      const item = getItemById(itemId);
      if (!item) {
        return fail(reply, 'NOT_FOUND', 'Item not found: ' + itemId, 404);
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const send = (event: InstallEvent) => {
        reply.raw.write('data: ' + JSON.stringify(event) + '\n\n');
      };

      try {
        await runAgentInstall({ itemId, installPath, emit: send });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ phase: 'error', message: msg });
        logger.error('install', 'agent-install', 'Install failed: ' + msg);
      } finally {
        reply.raw.end();
      }
    },
  );

  /** List installed agents. */
  app.get('/api/agent/status', async (_req, reply) => {
    const installed = queryInstalledAgents();
    return ok(reply, { installed });
  });

  /** Uninstall an agent (remove files + DB record). */
  app.delete<{ Params: { agentName: string } }>(
    '/api/agent/:agentName',
    async (req, reply) => {
      const { agentName } = req.params;
      const existing = getInstalledAgent(agentName);
      if (!existing) {
        return fail(reply, 'NOT_FOUND', 'Agent not found: ' + agentName, 404);
      }

      // Safety: only remove within the recorded install_path
      const resolvedPath = path.resolve(existing.install_path);
      const parentDir = path.dirname(resolvedPath);
      if (!fs.existsSync(resolvedPath)) {
        deleteInstalledAgent(agentName);
        return ok(reply, { deleted: agentName });
      }

      try {
        fs.rmSync(resolvedPath, { recursive: true, force: true });
        // Clean up empty parent (agents base dir) if no siblings remain
        try {
          const siblings = fs.readdirSync(parentDir);
          if (siblings.length === 0) {
            fs.rmdirSync(parentDir);
          }
        } catch {
          // Parent cleanup is best-effort
        }
        deleteInstalledAgent(agentName);
        logger.info('install', 'agent-uninstall', 'Removed ' + agentName + ' from ' + resolvedPath);
        return ok(reply, { deleted: agentName });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('install', 'agent-uninstall', 'Failed: ' + msg);
        return fail(reply, 'UNINSTALL_ERROR', msg, 500);
      }
    },
  );
}