// Shared types for AI Radar - used by both server and web

/** Source type for a collected item */
export type SourceType = 'github' | 'hackernews' | 'rss';

/** Item type classification */
export type ItemType = 'project' | 'news' | 'skill' | 'agent' | 'finance';

/** Item status in the scoring pipeline */
export type ItemStatus = 'candidate' | 'scored' | 'hidden';

/** A single discovered item (news, project, skill, etc.) */
export interface Item {
  id: string;
  source_type: SourceType;
  source_id: string;
  url: string;
  title: string;
  title_zh: string | null;
  summary: string | null;
  lang: string;
  item_type: ItemType;
  raw_data: string | null;
  stars: number;
  stars_prev: number | null;
  forks: number;
  author: string | null;
  pushed_at: string | null;
  score: number;
  score_detail: ScoreDetail | null;
  status: ItemStatus;
  is_read: number;
  is_favorited: number;
  collected_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Per-dimension score breakdown (0-1 each before weighting) */
export interface ScoreDetail {
  star_velocity: number;
  activity: number;
  fork_ratio: number;
  author_reputation: number;
  issue_health: number;
}

/** Scoring dimension weights (should sum to 1.0) */
export interface ScoreWeights {
  star_velocity: number;
  activity: number;
  fork_ratio: number;
  author_reputation: number;
  issue_health: number;
}

/** Feed query parameters */
export interface FeedQuery {
  type?: ItemType | 'all';
  lang?: string | 'all';
  source?: SourceType | 'all';
  sort?: 'score' | 'hot' | 'recent';
  score_min?: number;
  q?: string;
  page?: number;
  limit?: number;
}

/** Paginated feed response */
export interface FeedResult {
  items: Item[];
  total: number;
  page: number;
  limit: number;
}

/** Application settings */
export interface Settings {
  github_token: string;
  fetch_interval_hours: number;
  topic_words: string[];
  score_weights: ScoreWeights;
  score_threshold: number;
  llm_api_key: string;
  llm_base_url: string;
  llm_model: string;
  llm_timeout_ms: number;
}

/** Default settings values */
export const DEFAULT_SETTINGS: Settings = {
  github_token: '',
  fetch_interval_hours: 6,
  topic_words: ['ai-agent', 'codex-skill', 'mcp', 'llm', 'rag', 'ai-toolkit', 'prompt-engineering'],
  score_weights: {
    star_velocity: 0.35,
    activity: 0.25,
    fork_ratio: 0.15,
    author_reputation: 0.15,
    issue_health: 0.10,
  },
  score_threshold: 20,
  llm_api_key: '',
  llm_base_url: 'https://open.bigmodel.cn/api/paas/v4',
  llm_model: 'glm-4-plus',
  llm_timeout_ms: 30000,
};

/** Log level */
export type LogLevel = 'info' | 'warn' | 'error';

/** Log category */
export type LogCategory = 'collect' | 'score' | 'api' | 'system';

/** A log entry stored in the DB */
export interface LogEntry {
  id: number;
  ts: string;
  level: LogLevel;
  category: LogCategory;
  action: string | null;
  target: string | null;
  message: string | null;
  duration_ms: number | null;
}

/** Log query parameters */
export interface LogQuery {
  category?: LogCategory | 'all';
  level?: LogLevel | 'all';
  limit?: number;
  since?: string;
}

/** Sync state for a data source */
export interface SyncState {
  source: string;
  last_run: string | null;
  last_success: string | null;
  item_count: number;
  error: string | null;
}

/** Author reputation cache entry */
export interface AuthorCache {
  author: string;
  max_stars: number;
  repo_count: number;
  fetched_at: string;
}

/** Unified API response wrapper */
export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/** Health check response */
export interface HealthResponse {
  db_items: number;
  last_collect: string | null;
  github_token: boolean;
}

/** Collect run result per source */
export interface CollectResult {
  source: string;
  fetched: number;
  errors: string[];
}
