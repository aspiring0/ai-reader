import type { RawItem, Collector } from './types.js';

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
  _tags?: string[];
}

interface HNResponse {
  hits: HNHit[];
  nbHits: number;
}

const AI_KEYWORDS = ['ai', 'llm', 'gpt', 'agent', 'machine learning', 'deep learning', 'neural', 'transformer', 'rag', 'mcp'];

/** Hacker News Algolia collector. Searches AI-related stories. */
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
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const data = (await resp.json()) as HNResponse;
        for (const hit of data.hits) {
          if (!hit.title || !hit.url) continue;
          results.push(this.mapHit(hit));
        }
      } catch (err) {
        console.error(`[hackernews] error fetching keyword ${keyword}:`, err);
      }
    }

    return results;
  }

  private mapHit(hit: HNHit): RawItem {
    // Strip HTML from story_text for summary
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
