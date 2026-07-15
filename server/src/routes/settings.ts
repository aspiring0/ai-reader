import type { FastifyInstance } from 'fastify';
import { getSettings, updateSettings } from '../lib/config.js';
import { ok } from './helpers.js';
import type { Settings } from '@shared/types';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings', async (_req, reply) => {
    const settings: Settings = getSettings();
    // Mask sensitive values
    const masked = {
      ...settings,
      github_token: settings.github_token ? '***' : '',
      llm_api_key: settings.llm_api_key ? '***' : '',
    };
    return ok(reply, masked);
  });

  app.put<{ Body: Partial<Settings> }>('/api/settings', async (req, reply) => {
    const updated = updateSettings(req.body);
    const masked = {
      ...updated,
      github_token: updated.github_token ? '***' : '',
      llm_api_key: updated.llm_api_key ? '***' : '',
    };
    return ok(reply, masked);
  });
}
