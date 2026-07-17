import { openDb } from './connection.js';
import type {
  Item,
  FeedQuery,
  FeedResult,
  SyncState,
  LogEntry,
  LogQuery,
  AuthorCache,
  ScoreDetail,
  InstalledAgent,
} from '@shared/types';

// ── Items ──────────────────────────────────────────────

/** Insert or update an item (upsert on source_type + source_id). */
export function upsertItem(item: Item): void {
  const db = openDb();
  db.prepare(`
    INSERT INTO items (
      id, source_type, source_id, url, title, title_zh, summary, lang,
      item_type, raw_data, stars, stars_prev, forks, author, pushed_at,
      score, score_detail, status, is_read, is_favorited,
      collected_at, created_at, updated_at, interpreted_at
    ) VALUES (
      @id, @source_type, @source_id, @url, @title, @title_zh, @summary, @lang,
      @item_type, @raw_data, @stars, @stars_prev, @forks, @author, @pushed_at,
      @score, @score_detail, @status, @is_read, @is_favorited,
      @collected_at, @created_at, @updated_at, @interpreted_at
    )
    ON CONFLICT(source_type, source_id) DO UPDATE SET
      url = @url, title = @title,
      lang = @lang, item_type = @item_type, raw_data = @raw_data,
      stars = @stars, stars_prev = @stars_prev, forks = @forks,
      author = @author, pushed_at = @pushed_at, score = @score,
      score_detail = @score_detail, status = @status,
      is_read = @is_read, is_favorited = @is_favorited,
      collected_at = @collected_at, updated_at = @updated_at
  `).run({
    ...item,
    score_detail: item.score_detail ? JSON.stringify(item.score_detail) : null,
    raw_data: item.raw_data ?? null,
    title_zh: item.title_zh,
    summary: item.summary,
    interpreted_at: item.interpreted_at ?? null,
    author: item.author,
    pushed_at: item.pushed_at,
    stars_prev: item.stars_prev,
    collected_at: item.collected_at,
  });
}

/** Get a single item by id. Returns null if not found. */
export function getItemById(id: string): Item | null {
  const db = openDb();
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
  return row ? rowToItem(row) : null;
}

/** Get a single item by source_type + source_id. Returns null if not found. */
export function getItemBySource(sourceType: string, sourceId: string): Item | null {
  const db = openDb();
  const row = db.prepare('SELECT * FROM items WHERE source_type = ? AND source_id = ?')
    .get(sourceType, sourceId) as ItemRow | undefined;
  return row ? rowToItem(row) : null;
}

/** Get existing stars for an item (for snapshot velocity calculation). Returns null if not found. */
export function getExistingStars(sourceType: string, sourceId: string): number | null {
  const db = openDb();
  const row = db.prepare('SELECT stars FROM items WHERE source_type = ? AND source_id = ?')
    .get(sourceType, sourceId) as { stars: number } | undefined;
  return row ? row.stars : null;
}

/** Query the feed with filtering, sorting, search, and pagination. */
export function queryFeed(query: FeedQuery): FeedResult {
  const db = openDb();
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = ["status != 'hidden'"];
  const params: Record<string, string | number> = {};

  if (query.type && query.type !== 'all') {
    conditions.push('item_type = @type');
    params.type = query.type;
  }
  if (query.lang && query.lang !== 'all') {
    conditions.push('lang = @lang');
    params.lang = query.lang;
  }
  if (query.source && query.source !== 'all') {
    conditions.push('source_type = @source');
    params.source = query.source;
  }
 if (query.score_min !== undefined && query.score_min > 0) {
   conditions.push('score >= @score_min');
   params.score_min = query.score_min;
 }
  if (query.score_max !== undefined && query.score_max > 0) {
    conditions.push('score <= @score_max');
    params.score_max = query.score_max;
  }
  if (query.since) {
    conditions.push('updated_at >= @since');
    params.since = query.since;
  }
 if (query.q) {
    conditions.push('(title LIKE @q OR title_zh LIKE @q OR summary LIKE @q)');
   params.q = `%${query.q}%`;
 }

  const where = conditions.join(' AND ');
  const sortCol = query.sort === 'hot' ? 'stars' : query.sort === 'recent' ? 'updated_at' : 'score';
  const sortDir = query.sort_dir === 'asc' ? 'ASC' : 'DESC';
  const countParams = { ...params } as Record<string, import('node:sqlite').SQLInputValue>;
  const selectParams = { ...params, limit, offset } as Record<string, import('node:sqlite').SQLInputValue>;

  const countRow = db.prepare(`SELECT COUNT(*) as c FROM items WHERE ${where}`).get(countParams) as { c: number };
  const rows = db.prepare(
    `SELECT * FROM items WHERE ${where} ORDER BY ${sortCol} ${sortDir} LIMIT @limit OFFSET @offset`
  ).all(selectParams) as unknown as ItemRow[];

  return {
    items: rows.map(rowToItem),
    total: countRow.c,
    page,
    limit,
  };
}

/** Count all items regardless of status. */
export function getItemCount(): number {
  const db = openDb();
  const row = db.prepare('SELECT COUNT(*) as c FROM items').get() as { c: number };
  return row.c;
}

/** Query trending items by recent star growth (stars - stars_prev DESC). */
export function queryTrending(limit = 10): Item[] {
  const db = openDb();
  const rows = db.prepare(
    `SELECT * FROM items
     WHERE status != 'hidden' AND stars_prev IS NOT NULL AND stars_prev > 0
       AND (stars - stars_prev) > 0
     ORDER BY (stars - stars_prev) DESC
     LIMIT ?`,
  ).all(Math.min(50, limit)) as unknown as ItemRow[];
  return rows.map(rowToItem);
}

/** Query items first seen after a given timestamp (new since last refresh). */
export function queryNewSince(since: string, limit = 20): Item[] {
  const db = openDb();
  const rows = db.prepare(
    `SELECT * FROM items
     WHERE status != 'hidden' AND collected_at > ?
     ORDER BY stars DESC
     LIMIT ?`,
  ).all(since, Math.min(50, limit)) as unknown as ItemRow[];
  return rows.map(rowToItem);
}

/** Get the most recent collect timestamp (for 'new since' queries). */
export function getLastCollectTime(): string | null {
  const db = openDb();
  const row = db.prepare(
    `SELECT MAX(collected_at) as ts FROM items`,
  ).get() as { ts: string | null };
  return row.ts;
}

/** Delete an item by id. */
export function deleteItem(id: string): void {
  const db = openDb();
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
}

/** Partially update an item's editable fields. */
export function updateItemFields(
  id: string,
  fields: Partial<Pick<Item, 'title' | 'title_zh' | 'summary' | 'score' | 'status' | 'item_type' | 'lang' | 'url' | 'is_favorited' | 'is_read' | 'interpreted_at'>>
): void {
  const db = openDb();
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  const allowed: Record<string, string> = {
    title: 'title', title_zh: 'title_zh', summary: 'summary', score: 'score',
    status: 'status', item_type: 'item_type', lang: 'lang', url: 'url',
    is_favorited: 'is_favorited', is_read: 'is_read', interpreted_at: 'interpreted_at',
  };
  for (const [k, v] of Object.entries(fields)) {
    if (allowed[k]) { sets.push(`${allowed[k]} = ?`); vals.push(v as string | number); }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = '" + new Date().toISOString() + "'");
  vals.push(id);
  db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

/** Create a manual item. Caller must provide a valid Item object. */
export function createManualItem(item: Item): void {
  upsertItem(item);
}

/** Get items that have not been interpreted yet (interpreted_at IS NULL, status = scored). */
export function getUninterpretedItems(limit = 50): Item[] {
  const db = openDb();
  const rows = db.prepare(
    "SELECT * FROM items WHERE interpreted_at IS NULL AND status = 'scored' ORDER BY score DESC LIMIT ?"
  ).all(limit) as unknown as ItemRow[];
  return rows.map(rowToItem);
}

/** Count uninterpreted items. */
export function getUninterpretedCount(): number {
  const db = openDb();
  const row = db.prepare(
    "SELECT COUNT(*) as c FROM items WHERE interpreted_at IS NULL AND status = 'scored'"
  ).get() as { c: number };
  return row.c;
}

/** Get scored items regardless of interpretation status (for force re-interpret). */
export function getScoredItemsForReinterpret(limit = 50): Item[] {
  const db = openDb();
  const rows = db.prepare(
    "SELECT * FROM items WHERE status = 'scored' ORDER BY score DESC LIMIT ?"
  ).all(limit) as unknown as ItemRow[];
  return rows.map(rowToItem);
}

/** Count scored items (for re-interpret progress reporting). */
export function getScoredCount(): number {
  const db = openDb();
  const row = db.prepare(
    "SELECT COUNT(*) as c FROM items WHERE status = 'scored'"
  ).get() as { c: number };
  return row.c;
}

/** Count items by status for admin dashboard. */
export function getItemCounts(): { total: number; scored: number; hidden: number; favorited: number } {
  const db = openDb();
  const total = (db.prepare('SELECT COUNT(*) as c FROM items').get() as { c: number }).c;
  const scored = (db.prepare("SELECT COUNT(*) as c FROM items WHERE status='scored'").get() as { c: number }).c;
  const hidden = (db.prepare("SELECT COUNT(*) as c FROM items WHERE status='hidden'").get() as { c: number }).c;
  const favorited = (db.prepare('SELECT COUNT(*) as c FROM items WHERE is_favorited=1').get() as { c: number }).c;
  return { total, scored, hidden, favorited };
}

/** Get all items for admin table (including hidden). */
export function queryAllItems(limit = 200, offset = 0): { items: Item[]; total: number } {
  const db = openDb();
  const total = (db.prepare('SELECT COUNT(*) as c FROM items').get() as { c: number }).c;
  const rows = db.prepare('SELECT * FROM items ORDER BY updated_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as unknown as ItemRow[];
  return { items: rows.map(rowToItem), total };
}

/** Get all items for rescoring (minimal fields needed by the scorer). */
export function getAllItemsForScoring(): Array<{
  id: string;
  stars: number;
  stars_prev: number | null;
  forks: number;
  pushed_at: string | null;
  collected_at: string | null;
  raw_data: string | null;
}> {
  const db = openDb();
  return db.prepare(
    'SELECT id, stars, stars_prev, forks, pushed_at, collected_at, raw_data FROM items'
  ).all() as Array<{
    id: string;
    stars: number;
    stars_prev: number | null;
    forks: number;
    pushed_at: string | null;
    collected_at: string | null;
    raw_data: string | null;
  }>;
}

/** Update an item's score, score_detail, and status (used by rescore). */
export function updateItemScore(
  id: string,
  score: number,
  scoreDetail: ScoreDetail,
  status: string,
): void {
  const db = openDb();
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE items SET score = ?, score_detail = ?, status = ?, updated_at = ? WHERE id = ?'
  ).run(score, JSON.stringify(scoreDetail), status, now, id);
}

// ---------------------------------------------------------------- Stats

/** Daily high-score item counts for the last N days. Returns [{date, count}] sorted ascending. */
export function getDailyScoreCounts(days = 30): { date: string; count: number }[] {
  const db = openDb();
  const rows = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM items
    WHERE status != 'hidden'
      AND created_at >= DATE('now', '-' || ? || ' days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all(days) as { date: string; count: number }[];
  return rows;
}

/** Source distribution counts. Returns { github, hackernews, rss }. */
export function getSourceDistribution(): { source: string; count: number }[] {
  const db = openDb();
  const rows = db.prepare(`
    SELECT source_type as source, COUNT(*) as count
    FROM items WHERE status != 'hidden'
    GROUP BY source_type ORDER BY count DESC
  `).all() as { source: string; count: number }[];
  return rows;
}

/** Score distribution histogram in buckets of 20. Returns [{ bucket: "0-19", count: N }, ...]. */
export function getScoreDistribution(): { bucket: string; count: number }[] {
  const db = openDb();
  const rows = db.prepare(`
    SELECT
      CAST(score / 20 AS INTEGER) * 20 as bucket_start,
      COUNT(*) as count
    FROM items
    WHERE status != 'hidden' AND score > 0
    GROUP BY bucket_start
    ORDER BY bucket_start ASC
  `).all() as { bucket_start: number; count: number }[];
  // Convert to labeled buckets
  const labels = ['0-19', '20-39', '40-59', '60-79', '80-100'];
  const map = new Map(rows.map(r => [r.bucket_start, r.count]));
  return labels.map((label, i) => {
    const start = i * 20;
    return { bucket: label, count: map.get(start) ?? 0 };
  });
}

/** Top topics from GitHub raw_data JSON. Returns [{topic, count}] sorted by count DESC. */
export function getTopTopics(limit = 20): { topic: string; count: number }[] {
  const db = openDb();
  // Get all GitHub items' raw_data (topics are in JSON)
  const rows = db.prepare(`
    SELECT raw_data FROM items
    WHERE source_type = 'github' AND status != 'hidden' AND raw_data IS NOT NULL
  `).all() as { raw_data: string }[];

  const topicCounts = new Map<string, number>();
  for (const row of rows) {
    try {
      const data = JSON.parse(row.raw_data) as Record<string, unknown>;
      if (Array.isArray(data.topics)) {
        for (const t of data.topics) {
          if (typeof t === 'string' && t.length > 0) {
            topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
          }
        }
      }
    } catch { /* skip invalid JSON */ }
  }

  return [...topicCounts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Top languages from GitHub raw_data. Returns [{lang, count}] sorted by count DESC. */
export function getTopLanguages(limit = 10): { lang: string; count: number }[] {
  const db = openDb();
  const rows = db.prepare(`
    SELECT raw_data FROM items
    WHERE source_type = 'github' AND status != 'hidden' AND raw_data IS NOT NULL
  `).all() as { raw_data: string }[];

  const langCounts = new Map<string, number>();
  for (const row of rows) {
    try {
      const data = JSON.parse(row.raw_data) as Record<string, unknown>;
      if (typeof data.language === 'string' && data.language.length > 0) {
        langCounts.set(data.language, (langCounts.get(data.language) ?? 0) + 1);
      }
    } catch { /* skip */ }
  }

  return [...langCounts.entries()]
    .map(([lang, count]) => ({ lang, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ── Settings ───────────────────────────────────────────

export function getSetting(key: string): string {
  const db = openDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? '';
}

export function setSetting(key: string, value: string): void {
  const db = openDb();
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(key, value, value);
}

export function getAllSettings(): Record<string, string> {
  const db = openDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const result: Record<string, string> = {};
  for (const r of rows) result[r.key] = r.value;
  return result;
}

// ── SyncState ──────────────────────────────────────────

export function upsertSyncState(source: string, state: Omit<SyncState, 'source'>): void {
  const db = openDb();
  db.prepare(`
    INSERT INTO sync_state (source, last_run, last_success, item_count, error)
    VALUES (@source, @last_run, @last_success, @item_count, @error)
    ON CONFLICT(source) DO UPDATE SET
      last_run = @last_run, last_success = @last_success,
      item_count = @item_count, error = @error
  `).run({ source, ...state });
}

export function getSyncState(source: string): SyncState | null {
  const db = openDb();
  const row = db.prepare('SELECT * FROM sync_state WHERE source = ?').get(source) as SyncState | undefined;
  return row ?? null;
}

export function getAllSyncState(): SyncState[] {
  const db = openDb();
  return db.prepare('SELECT * FROM sync_state ORDER BY source').all() as unknown as SyncState[];
}

// ── Logs ───────────────────────────────────────────────

export function insertLog(entry: Omit<LogEntry, 'id'>): void {
  const db = openDb();
  db.prepare(`
    INSERT INTO logs (ts, level, category, action, target, message, duration_ms)
    VALUES (@ts, @level, @category, @action, @target, @message, @duration_ms)
  `).run(entry);
}

export function queryLogs(query: LogQuery): LogEntry[] {
  const db = openDb();
  const conditions: string[] = [];
  const params: Record<string, string | number> = { limit: query.limit ?? 100 };

  if (query.category && query.category !== 'all') {
    conditions.push('category = @category');
    params.category = query.category;
  }
  if (query.level && query.level !== 'all') {
    conditions.push('level = @level');
    params.level = query.level;
  }
  if (query.since) {
    conditions.push('ts >= @since');
    params.since = query.since;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sqlParams = params as Record<string, import('node:sqlite').SQLInputValue>;
  return db.prepare(
    `SELECT * FROM logs ${where} ORDER BY ts DESC LIMIT @limit`
  ).all(sqlParams) as unknown as LogEntry[];
}

// ── Author Cache ───────────────────────────────────────

export function getAuthorCache(author: string): AuthorCache | null {
  const db = openDb();
  const row = db.prepare('SELECT * FROM author_cache WHERE author = ?').get(author) as AuthorCache | undefined;
  return row ?? null;
}

export function setAuthorCache(entry: AuthorCache): void {
  const db = openDb();
  db.prepare(`
    INSERT INTO author_cache (author, max_stars, repo_count, fetched_at)
    VALUES (@author, @max_stars, @repo_count, @fetched_at)
    ON CONFLICT(author) DO UPDATE SET
      max_stars = @max_stars, repo_count = @repo_count, fetched_at = @fetched_at
  `).run({
    author: entry.author,
    max_stars: entry.max_stars,
    repo_count: entry.repo_count,
    fetched_at: entry.fetched_at,
  });
}

// ── Helpers ────────────────────────────────────────────

interface ItemRow {
  id: string;
  source_type: string;
  source_id: string;
  url: string;
  title: string;
  title_zh: string | null;
  summary: string | null;
  lang: string;
  item_type: string;
  raw_data: string | null;
  stars: number;
  stars_prev: number | null;
  forks: number;
  author: string | null;
  pushed_at: string | null;
  score: number;
  score_detail: string | null;
  status: string;
  is_read: number;
  is_favorited: number;
  collected_at: string | null;
  created_at: string;
  updated_at: string;
  interpreted_at: string | null;
}

function rowToItem(row: ItemRow): Item {
  return {
    ...row,
    score_detail: row.score_detail ? JSON.parse(row.score_detail) as ScoreDetail : null,
  } as Item;
}

// ── Installed skills (SP3) ────────────────────────────────────

export interface InstalledSkillRow {
  id: number;
  item_id: string;
  skill_name: string;
  skill_path: string;
  install_method: string | null;
  scan_level: string | null;
  installed_at: string;
}

export interface InstalledSkill {
  id: number;
  item_id: string;
  skill_name: string;
  skill_path: string;
  install_method: string | null;
  scan_level: string | null;
  installed_at: string;
}

/** Record a freshly installed skill (UNIQUE on skill_name prevents duplicates). */
export function insertInstalledSkill(data: {
  item_id: string;
  skill_name: string;
  skill_path: string;
  install_method?: string | null;
  scan_level?: string | null;
}): void {
  const db = openDb();
  db.prepare(
    `INSERT INTO installed_skills (item_id, skill_name, skill_path, install_method, scan_level)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(skill_name) DO UPDATE SET
       item_id = excluded.item_id,
       skill_path = excluded.skill_path,
       install_method = excluded.install_method,
       scan_level = excluded.scan_level,
       installed_at = datetime('now')`,
  ).run(data.item_id, data.skill_name, data.skill_path, data.install_method ?? null, data.scan_level ?? null);
}

/** List all installed skills, most recent first. */
export function queryInstalledSkills(): InstalledSkill[] {
  const db = openDb();
  const rows = db.prepare(
    'SELECT * FROM installed_skills ORDER BY installed_at DESC',
  ).all() as unknown as InstalledSkillRow[];
  return rows as InstalledSkill[];
}

/** Remove an installed skill record by skill_name. */
export function deleteInstalledSkill(skillName: string): boolean {
  const db = openDb();
  const result = db.prepare(
    'DELETE FROM installed_skills WHERE skill_name = ?',
  ).run(skillName);
  return result.changes > 0;
}

/** Look up an installed skill by skill_name. */
export function getInstalledSkill(skillName: string): InstalledSkill | null {
  const db = openDb();
  const row = db.prepare(
    'SELECT * FROM installed_skills WHERE skill_name = ?',
  ).get(skillName) as InstalledSkillRow | undefined;
  return row ?? null;
}

// ---- Installed Agents (V2.4) ----

export interface InstalledAgentRow {
  id: number;
  item_id: string;
  agent_name: string;
  agent_type: string;
  install_path: string;
  run_command: string | null;
  binary_path: string | null;
  docker_image: string | null;
  installed_at: string;
}

/** Record a freshly installed agent. */
export function insertInstalledAgent(data: {
  item_id: string;
  agent_name: string;
  agent_type: string;
  install_path: string;
  run_command?: string | null;
  binary_path?: string | null;
  docker_image?: string | null;
}): void {
  const db = openDb();
  db.prepare(
    `INSERT INTO installed_agents (item_id, agent_name, agent_type, install_path, run_command, binary_path, docker_image)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(agent_name) DO UPDATE SET
       item_id = excluded.item_id,
       agent_type = excluded.agent_type,
       install_path = excluded.install_path,
       run_command = excluded.run_command,
       binary_path = excluded.binary_path,
       docker_image = excluded.docker_image,
       installed_at = datetime('now')`,
  ).run(data.item_id, data.agent_name, data.agent_type, data.install_path, data.run_command ?? null, data.binary_path ?? null, data.docker_image ?? null);
}

/** List all installed agents, most recent first. */
export function queryInstalledAgents(): InstalledAgent[] {
  const db = openDb();
  const rows = db.prepare('SELECT * FROM installed_agents ORDER BY installed_at DESC').all() as unknown as InstalledAgentRow[];
  return rows;
}

/** Remove an installed agent record by name. */
export function deleteInstalledAgent(agentName: string): boolean {
  const db = openDb();
  const result = db.prepare('DELETE FROM installed_agents WHERE agent_name = ?').run(agentName);
  return result.changes > 0;
}

/** Look up an installed agent by name. */
export function getInstalledAgent(agentName: string): InstalledAgent | null {
  const db = openDb();
  const row = db.prepare('SELECT * FROM installed_agents WHERE agent_name = ?').get(agentName) as InstalledAgentRow | undefined;
  return row ?? null;
}
