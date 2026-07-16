/** Safely extract rich metadata from an item's raw_data JSON string. */

export interface GithubMeta {
  description?: string;
  topics?: string[];
  homepage?: string;
  license?: string;
  language?: string;
  created_at?: string;
  pushed_at?: string;
  open_issues_count?: number;
  archived?: boolean;
}

export interface HNMeta {
  points?: number;
  num_comments?: number;
  author?: string;
  story_text?: string;
  created_at?: string;
}

export interface RSSMeta {
  title?: string;
  content?: string;
  contentSnippet?: string;
  creator?: string;
  source?: string;
  pubDate?: string;
  isoDate?: string;
}

function safeParse(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}

export function getGithubMeta(raw: string | null): GithubMeta | null {
  const d = safeParse(raw);
  if (!d) return null;
  const lic = typeof d.license === 'object' && d.license ? (d.license as Record<string, unknown>).name as string : undefined;
  return {
    description: d.description as string | undefined,
    topics: Array.isArray(d.topics) ? (d.topics as unknown[]).filter((t): t is string => typeof t === 'string') : undefined,
    homepage: d.homepage as string | undefined,
    license: lic,
    language: d.language as string | undefined,
    created_at: d.created_at as string | undefined,
    pushed_at: d.pushed_at as string | undefined,
    open_issues_count: d.open_issues_count as number | undefined,
    archived: d.archived as boolean | undefined,
  };
}

export function getHNMeta(raw: string | null): HNMeta | null {
  const d = safeParse(raw);
  if (!d) return null;
  return {
    points: d.points as number | undefined,
    num_comments: d.num_comments as number | undefined,
    author: d.author as string | undefined,
    story_text: d.story_text as string | undefined,
    created_at: d.created_at as string | undefined,
  };
}

export function getRSSMeta(raw: string | null): RSSMeta | null {
  const d = safeParse(raw);
  if (!d) return null;
  return {
    title: d.title as string | undefined,
    content: d.content as string | undefined,
    contentSnippet: d.contentSnippet as string | undefined,
    creator: d.creator as string | undefined,
    source: d.source as string | undefined,
    pubDate: d.pubDate as string | undefined,
    isoDate: d.isoDate as string | undefined,
  };
}
