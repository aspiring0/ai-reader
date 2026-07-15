/** Normalize a URL for dedup comparison. */
export function normalizeUrl(url: string): string {
  let u = url.trim().toLowerCase();
  // Remove protocol
  u = u.replace(/^https?:\/\//, '');
  // Remove trailing slash
  u = u.replace(/\/+$/, '');
  // Remove www.
  u = u.replace(/^www\./, '');
  // Remove fragment
  u = u.split('#')[0];
  // Normalize github URL (remove .git suffix)
  u = u.replace(/\.git$/, '');
  return u;
}

/** Jaccard similarity between two strings (tokenized by spaces). */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/** Threshold for considering two items duplicates by title similarity. */
const TITLE_SIMILARITY_THRESHOLD = 0.8;

export interface RawItemLike {
  url: string;
  title: string;
  stars?: number;
}

/**
 * Deduplicate items: if two items have the same normalized URL,
 * keep the one with more stars. If URLs differ but titles are
 * very similar (Jaccard > threshold), keep the higher-star one.
 */
export function dedup<T extends RawItemLike>(items: T[]): T[] {
  const result: T[] = [];
  const seenUrls = new Set<string>();

  // Sort by stars descending so we keep the most popular first
  const sorted = [...items].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));

  for (const item of sorted) {
    const normUrl = normalizeUrl(item.url);
    if (seenUrls.has(normUrl)) continue;

    // Check title similarity against already-accepted items
    let isDuplicate = false;
    for (const accepted of result) {
      if (jaccardSimilarity(item.title, accepted.title) >= TITLE_SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seenUrls.add(normUrl);
      result.push(item);
    }
  }

  return result;
}
