import type { RawItem, Collector } from './types.js';
import { fetchWithRetry } from '../lib/http.js';
import { logger } from '../lib/logger.js';

const HN_API = 'https://hn.algolia.com/api/v1/search';

interface HNHit {
  objectID: string;
  title: string | null;
  url: string | null;
  story_text?: string | null;
  points?: number;
  author?: string;
  created_at: string;
  num_comments?: number;
}

interface HNResponse {
  hits: HNHit[];
  nbHits: number;
}

const AI_KEYWORDS = ['ai', 'llm', 'gpt', 'agent', 'machine learning', 'deep learning', 'neural', 'transformer', 'rag', 'mcp'];

export class HackerNewsCollector implements Collector {
  readonly name = 'hackernews';

  async fetch(): Promise<RawItem[]> {
    const results: RawItem[] = [];

    for (const keyword of AI_KEYWORDS) {
      const params = new URLSearchParams({
        query: keyword,
        tags: 'story',
        hitsPerPage: '15',
        numericFilters: 'points>10',
      });
      const url = `${HN_API}?${params}`;
      try {
        const resp = await fetchWithRetry(url, { source: this.name, timeoutMs: 10000 });
        if (!resp.ok) {
          logger.warn('collect', this.name, `HTTP ${resp.status} for keyword ${keyword}`);
          continue;
        }
        const data = (await resp.json()) as HNResponse;
        for (const hit of data.hits) {
          if (!hit.title || !hit.url) continue;
          results.push(this.mapHit(hit));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('collect', this.name, `Error fetching keyword ${keyword}: ${msg}`);
      }
    }

    return results;
  }

  private mapHit(hit: HNHit): RawItem {
    const summary = hit.story_text
      ? hit.story_text.replace(/<[^>]+>/g, '').slice(0, 300)
      : null;
    return {
      source_type: 'hackernews',
      source_id: hit.objectID,
      url: hit.url!,
      title: hit.title!,
      summary,
      lang: 'en',
      item_type: 'news',
      raw_data: JSON.stringify(hit),
      stars: hit.points ?? 0,
      forks: hit.num_comments ?? 0,
      author: hit.author ?? null,
      pushed_at: hit.created_at,
    };
  }
}
