import type { RawItem, Collector } from './types.js';
import { getSetting } from '../db/repository.js';
import { fetchWithRetry } from '../lib/http.js';
import { CollectError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const GITHUB_API = 'https://api.github.com';

interface GitHubSearchResponse {
  total_count: number;
  items: GitHubRepo[];
}

interface GitHubRepo {
  id: number;
  full_name: string;
  html_url: string;
  name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  owner: { login: string };
  pushed_at: string;
  topics?: string[];
  created_at: string;
  updated_at: string;
}

export class GitHubCollector implements Collector {
  readonly name = 'github';

  async fetch(): Promise<RawItem[]> {
    const topicsRaw = getSetting('topic_words');
    const topics = topicsRaw
      ? topicsRaw.split(',').map((t) => t.trim()).filter(Boolean)
      : ['ai-agent', 'codex-skill', 'mcp', 'llm'];

    const token = getSetting('github_token');
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ai-radar',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const results: RawItem[] = [];

    for (const topic of topics) {
      const query = `topic:${topic}+created:>${since}+sort:stars`;
      const url = `${GITHUB_API}/search/repositories?q=${query}&per_page=20`;
      try {
        const resp = await fetchWithRetry(url, { headers, source: this.name, timeoutMs: 10000 });
        if (!resp.ok) {
          logger.warn('collect', this.name, `HTTP ${resp.status} for topic ${topic}`);
          continue;
        }
        const data = (await resp.json()) as GitHubSearchResponse;
        for (const repo of data.items) {
          results.push(this.mapRepo(repo));
        }
      } catch (err) {
        // Rate limit: stop fetching remaining topics (all will fail)
        if (err instanceof CollectError && err.category === 'rate_limit') {
          logger.warn('collect', this.name, `Rate limited, stopping remaining topics`);
          break;
        }
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('collect', this.name, `Error fetching topic ${topic}: ${msg}`);
      }
    }

    return results;
  }

  private mapRepo(repo: GitHubRepo): RawItem {
    return {
      source_type: 'github',
      source_id: repo.full_name,
      url: repo.html_url,
      title: repo.full_name,
      summary: repo.description,
      lang: 'en',
      item_type: this.inferType(repo),
      raw_data: JSON.stringify(repo),
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      author: repo.owner.login,
      pushed_at: repo.pushed_at,
      open_issues: repo.open_issues_count,
    };
  }

  private inferType(repo: GitHubRepo): string {
    const topics = repo.topics ?? [];
    const name = repo.name.toLowerCase();
    if (topics.includes('codex-skill') || name.includes('skill')) return 'skill';
    if (topics.includes('ai-agent') || name.includes('agent')) return 'agent';
    if (topics.includes('mcp') || name.includes('mcp')) return 'agent';
    return 'project';
  }
}

export async function fetchAuthorReputation(author: string, token?: string): Promise<{ max_stars: number; repo_count: number }> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ai-radar',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `${GITHUB_API}/users/${author}/repos?sort=stars&per_page=100`;
  try {
    const resp = await fetchWithRetry(url, { headers, source: 'github', timeoutMs: 10000 });
    if (!resp.ok) return { max_stars: 0, repo_count: 0 };
    const repos = (await resp.json()) as { stargazers_count: number }[];
    return {
      max_stars: repos.reduce((max, r) => Math.max(max, r.stargazers_count), 0),
      repo_count: repos.length,
    };
  } catch {
    return { max_stars: 0, repo_count: 0 };
  }
}
