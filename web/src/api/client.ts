const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message || 'Request failed');
  return json.data as T;
}

export type FeedParams = {
  type?: string; lang?: string; source?: string; sort?: string;
 score_min?: number; score_max?: number; since?: string; q?: string; page?: number; limit?: number;
  sort_dir?: 'asc' | 'desc';
};

export const api = {
  feed: (params?: FeedParams) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.entries(params).filter(([_, v]) => v != null).map(([k, v]) => [k, String(v)])
    ).toString() : '';
    return request<{ items: import('@shared/types').Item[]; total: number; page: number; limit: number }>('/feed' + qs);
  },
  item: (id: string) => request<import('@shared/types').Item>('/feed/' + encodeURIComponent(id)),
  trending: () => request<{ items: import('@shared/types').Item[] }>('/feed/trending'),
  newSince: (since?: string) => {
    const qs = since ? '?since=' + encodeURIComponent(since) : '';
    return request<{ items: import('@shared/types').Item[]; since: string }>('/feed/new' + qs);
  },
  meta: () => request<{ lastCollect: string | null }>('/feed/meta'),
  settings: () => request<import('@shared/types').Settings>('/settings'),
  updateSettings: (body: Partial<import('@shared/types').Settings>) =>
    request<import('@shared/types').Settings>('/settings', { method: 'PUT', body: JSON.stringify(body) }),
  health: () => request<import('@shared/types').HealthResponse>('/health'),
  collect: () => request<{ message: string }>('/collect/run', { method: 'POST', body: '{}' }),
  interpretRun: () => request<{ total: number; succeeded: number; failed: number; errors: string[] }>('/interpret/run', { method: 'POST', body: '{}' }),
  interpretRunForce: () => request<{ message: string; count: number }>('/interpret/run?force=true&limit=200', { method: 'POST', body: '{}' }),
  interpretItem: (id: string) => request<{ title_zh: string; summary: string }>('/interpret/' + encodeURIComponent(id), { method: 'POST', body: '{}' }),
  logs: (params?: { category?: string; level?: string; limit?: number; since?: string }) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.entries(params).filter(([_, v]) => v != null).map(([k, v]) => [k, String(v)])
    ).toString() : '';
    return request<import('@shared/types').LogEntry[]>('/logs' + qs);
  },
  install: {
    check: (itemId: string) =>
      request<{ compatibility: { tier: string; installable: boolean; skillName: string | null; label: string; reason: string }; scan: { riskLevel: string; totalIssues: number; stages: Record<string, { findings: string[] }> } | null; installable: boolean }>('/install/check/' + encodeURIComponent(itemId), { method: 'POST', body: '{}' }),
    run: (itemId: string, method?: string) =>
      request<{ ok: boolean; skillPath: string; method: string; filesWritten: number; warnings: string[] }>('/install/run', { method: 'POST', body: JSON.stringify({ itemId, method }) }),
    status: () =>
      request<{ installed: { id: number; item_id: string; skill_name: string; skill_path: string; install_method: string | null; scan_level: string | null; installed_at: string }[] }>('/install/status'),
    remove: (skillName: string) =>
      request<{ deleted: string }>('/install/' + encodeURIComponent(skillName), { method: 'DELETE' }),
  },
  admin: {
    stats: () => request<{ total: number; scored: number; hidden: number; favorited: number }>('/admin/stats'),
    items: (page = 1, limit = 100) =>
      request<{ items: import('@shared/types').Item[]; total: number }>('/admin/items?page=' + page + '&limit=' + limit),
    update: (id: string, body: Record<string, unknown>) =>
      request<import('@shared/types').Item>('/admin/items/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<{ deleted: string }>('/admin/items/' + encodeURIComponent(id), { method: 'DELETE' }),
    create: (body: Record<string, unknown>) =>
      request<import('@shared/types').Item>('/admin/items', { method: 'POST', body: JSON.stringify(body) }),
  },
  llm: {
    providers: () => request<{ providers: import('@shared/types').ProviderPreset[] }>('/llm/providers'),
    models: (body: { base_url?: string; api_key?: string }) =>
      request<{ models: string[]; error?: string }>('/llm/models', { method: 'POST', body: JSON.stringify(body) }),
   test: (body: { provider?: string; model?: string; api_key?: string; base_url?: string }) =>
     request<{ success: boolean; message: string }>('/llm/test', { method: 'POST', body: JSON.stringify(body) }),
 },
  stats: () => request<{
    daily_scores: { date: string; count: number }[];
    source_distribution: { source: string; count: number }[];
    score_distribution: { bucket: string; count: number }[];
    top_topics: { topic: string; count: number }[];
    top_languages: { lang: string; count: number }[];
 }>('/stats'),
  agent: {
    checkEnv: (itemId: string) =>
      request<{ detected_type: string; prerequisites: Array<{ name: string; installed: boolean; version: string | null; install_url: string | null; install_hint: string | null }>; all_met: boolean; blocked_by: string[]; is_skill: boolean; install_plan: { project_type: string; summary: string; prerequisites: string[]; steps: Array<{ command: string; description: string }>; run_command: string; notes: string[]; confidence: number } | null }>('/agent/check-env', { method: 'POST', body: JSON.stringify({ item_id: itemId }) }),
    defaultPath: () =>
      request<{ path: string; drives: string[] }>('/agent/default-path'),
    // Install returns a text/event-stream. We handle it with EventSource-like parsing.
    // This method returns a ReadableStream reader for SSE consumption.
    install: async (itemId: string, installPath: string, plan?: unknown) => {
      const res = await fetch('/api/agent/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, install_path: installPath, plan }),
      });
     return res.body;
   },
    status: () =>
      request<{ installed: Array<{ id: number; agent_name: string; agent_type: string; install_path: string; run_command: string | null; binary_path: string | null; docker_image: string | null; installed_at: string }> }>('/agent/status'),
    remove: (agentName: string) =>
      request<{ deleted: string }>('/agent/' + encodeURIComponent(agentName), { method: 'DELETE' }),
 },
};
