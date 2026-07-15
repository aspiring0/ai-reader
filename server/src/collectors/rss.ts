import type { RawItem, Collector } from './types.js';
import { getSetting } from '../db/repository.js';
import { fetchWithRetry, addAllowedDomain } from '../lib/http.js';
import { logger } from '../lib/logger.js';

const DEFAULT_FEEDS: Record<string, string> = {
  'jiqizhixin': 'https://www.jiqizhixin.com/rss',
  '36kr-ai': 'https://36kr.com/feed-newsflashes',
  'quantumbitan': 'https://www.qbitai.com/feed',
};

interface RSSItem {
  title: string;
  link: string;
  content?: string;
  contentSnippet?: string;
  pubDate?: string;
  isoDate?: string;
  creator?: string;
}

export class RSSCollector implements Collector {
  readonly name = 'rss';

  async fetch(): Promise<RawItem[]> {
    const feedsRaw = getSetting('rss_feeds');
    let feeds: Record<string, string>;
    try {
      feeds = feedsRaw ? JSON.parse(feedsRaw) : DEFAULT_FEEDS;
    } catch {
      logger.warn('collect', this.name, 'Invalid rss_feeds setting, using defaults');
      feeds = DEFAULT_FEEDS;
    }

    const results: RawItem[] = [];

    for (const [sourceLabel, feedUrl] of Object.entries(feeds)) {
      // Register user-configured domains in the whitelist
      try {
        const hostname = new URL(feedUrl).hostname;
        addAllowedDomain(hostname);
      } catch {
        logger.warn('collect', this.name, `Invalid feed URL for ${sourceLabel}: ${feedUrl}`);
        continue;
      }

      try {
        const resp = await fetchWithRetry(feedUrl, {
          source: this.name,
          timeoutMs: 10000,
          headers: { 'User-Agent': 'ai-radar' },
        });
        if (!resp.ok) {
          logger.warn('collect', this.name, `HTTP ${resp.status} for ${sourceLabel}`);
          continue;
        }
        const xml = await resp.text();
        const items = this.parseRSS(xml);
        for (const item of items) {
          if (!item.link || !item.title) continue;
          results.push({
            source_type: 'rss',
            source_id: `${sourceLabel}:${item.link}`,
            url: item.link,
            title: item.title,
            summary: item.contentSnippet?.slice(0, 300) ?? null,
            lang: 'zh',
            item_type: 'news',
            raw_data: JSON.stringify({ ...item, source: sourceLabel }),
            stars: 0,
            forks: 0,
            author: item.creator ?? sourceLabel,
            pushed_at: item.isoDate ?? item.pubDate ?? null,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('collect', this.name, `Error fetching ${sourceLabel}: ${msg}`);
      }
    }

    return results;
  }

  private parseRSS(xml: string): RSSItem[] {
    const items: RSSItem[] = [];
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = this.extractTag(block, 'title');
      const link = this.extractTag(block, 'link') || this.extractAttr(block, 'link', 'href');
      const content = this.extractTag(block, 'content:encoded') || this.extractTag(block, 'description');
      const pubDate = this.extractTag(block, 'pubDate');
      const creator = this.extractTag(block, 'dc:creator') || this.extractTag(block, 'author');

      items.push({
        title: title ? this.stripHtml(title) : '',
        link: link ?? '',
        content,
        contentSnippet: content ? this.stripHtml(content).slice(0, 300) : undefined,
        pubDate,
        isoDate: pubDate ? new Date(pubDate).toISOString() : undefined,
        creator: creator ? this.stripHtml(creator) : undefined,
      });
    }

    return items;
  }

  private extractTag(xml: string, tag: string): string | undefined {
    const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
    const match = regex.exec(xml);
    return match ? (match[1] ?? match[2]).trim() : undefined;
  }

  private extractAttr(xml: string, tag: string, attr: string): string | undefined {
    const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
    const match = regex.exec(xml);
    return match ? match[1] : undefined;
  }

  private stripHtml(s: string): string {
    return s.replace(/<[^>]+>/g, '').trim();
  }
}
