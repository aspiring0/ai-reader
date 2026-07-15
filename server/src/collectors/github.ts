import type { RawItem, Collector } from './types.js';
import { getSetting } from '../db/repository.js';

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

/** GitHub Search API collector. Searches by topic keywords, sorted by stars. */
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

    // Search repos created in the last 90 days, sorted by stars
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const results: RawItem[] = [];

    for (const topic of topics) {
      const query = `topic:${topic}+created:>${since}+sort:stars`;
      const url = `${GITHUB_API}/search/repositories?q=${query}&per_page=20`;
      try {
        const resp = await fetch(url, { headers });
        if (resp.status === 403) {
          // Rate limited
          console.warn(`[github] rate limited, skipping topic: ${topic}`);
          continue;
        }
        if (!resp.ok) continue;
        const data = (await resp.json()) as GitHubSearchResponse;
        for (const repo of data.items) {
          results.push(this.mapRepo(repo));
        }
      } catch (err) {
        console.error(`[github] error fetching topic ${topic}:`, err);
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
      lang: repo.language?.toLowerCase() === 'python' ? 'en' : 'en',
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

/** Fetch GitHub author reputation (max stars across their repos). */
export async function fetchAuthorReputation(author: string, token?: string): Promise<{ max_stars: number; repo_count: number }> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ai-radar',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `${GITHUB_API}/users/${author}/repos?sort=stars&per_page=100`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) return { max_stars: 0, repo_count: 0 };
  const repos = (await resp.json()) as { stargazers_count: number }[];
  return {
    max_stars: repos.reduce((max, r) => Math.max(max, r.stargazers_count), 0),
    repo_count: repos.length,
  };
}

