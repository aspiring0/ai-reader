import type { ScoreDetail, ScoreWeights } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';

/** Default weights from settings. */
export function getDefaultWeights(): ScoreWeights {
  return { ...DEFAULT_SETTINGS.score_weights };
}

/**
 * Calculate raw (pre-normalization) scores for each dimension.
 * Each value is in [0, 1] or could be slightly outside for edge cases.
 */
export function calculateRawScores(item: {
  stars: number;
  stars_prev: number | null;
  forks: number;
  pushed_at: string | null;
  collected_at: string | null;
  open_issues?: number;
  closed_issues?: number;
}): Omit<ScoreDetail, 'author_reputation'> {
  // Star velocity: if we have previous snapshot, use real diff; otherwise approximate
  let starVelocity: number;
  if (item.stars_prev !== null && item.stars_prev > 0 && item.collected_at) {
    const intervalDays = Math.max(1, (Date.now() - new Date(item.collected_at).getTime()) / (1000 * 60 * 60 * 24));
    const velocity = (item.stars - item.stars_prev) / item.stars_prev / intervalDays;
    starVelocity = Math.min(1, Math.max(0, velocity * 30)); // Scale: 3% daily growth = full score
  } else {
    // Fallback: log scale of absolute stars
    starVelocity = Math.log(item.stars + 1) / Math.log(100001);
  }

  // Activity: exponential decay from last push, half-life 30 days
  let activity: number;
  if (item.pushed_at) {
    const daysSincePush = (Date.now() - new Date(item.pushed_at).getTime()) / (1000 * 60 * 60 * 24);
    activity = Math.pow(0.5, daysSincePush / 30);
  } else {
    activity = 0;
  }

  // Fork/star ratio: peak at 0.05-0.3, penalty above 0.5
  let forkRatio: number;
  if (item.stars > 0) {
    const ratio = item.forks / item.stars;
    if (ratio >= 0.05 && ratio <= 0.3) {
      forkRatio = 1;
    } else if (ratio < 0.05) {
      forkRatio = ratio / 0.05;
    } else if (ratio <= 0.5) {
      forkRatio = 1 - (ratio - 0.3) / 0.2 * 0.3;
    } else {
      forkRatio = 0.3 - Math.min(0.3, (ratio - 0.5) * 0.3);
    }
  } else {
    forkRatio = 0;
  }

  // Issue health: closed / (open + closed)
  let issueHealth: number;
  const totalIssues = (item.open_issues ?? 0) + (item.closed_issues ?? 0);
  if (totalIssues > 0) {
    issueHealth = (item.closed_issues ?? 0) / totalIssues;
  } else {
    issueHealth = 0.5; // Neutral if no issue data
  }

  return {
    star_velocity: starVelocity,
    activity,
    fork_ratio: forkRatio,
    issue_health: issueHealth,
  };
}

/**
 * Calculate the author reputation score.
 * Uses log scale of max stars: log(max_stars + 1) / log(100001).
 */
export function calculateAuthorScore(maxStars: number): number {
  return Math.min(1, Math.max(0, Math.log(maxStars + 1) / Math.log(100001)));
}

/**
 * Normalize a set of values to [0, 1] using global min-max.
 */
export function normalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 1); // All same value -> all max
  return values.map((v) => (v - min) / range);
}

/**
 * Compute final weighted score for an item.
 * Takes raw per-dimension values and weights, returns 0-100 score.
 */
export function computeScore(
  raw: ScoreDetail,
  weights: ScoreWeights
): number {
  const weighted =
    raw.star_velocity * weights.star_velocity +
    raw.activity * weights.activity +
    raw.fork_ratio * weights.fork_ratio +
    raw.author_reputation * weights.author_reputation +
    raw.issue_health * weights.issue_health;
  return Math.round(Math.min(100, Math.max(0, weighted * 100)));
}

/**
 * Batch-score a list of items: calculates raw scores, normalizes across the batch,
 * then applies weights to get final scores.
 */
export function scoreItems(
  items: Array<{
    stars: number;
    stars_prev: number | null;
    forks: number;
    pushed_at: string | null;
    collected_at: string | null;
    open_issues?: number;
    closed_issues?: number;
    author_max_stars?: number;
  }>,
  weights: ScoreWeights = getDefaultWeights()
): Array<{ score: number; detail: ScoreDetail }> {
  // Calculate raw scores (except author_reputation which is pre-computed)
  const rawScores = items.map((item) => {
    const base = calculateRawScores(item);
    const authorReputation = calculateAuthorScore(item.author_max_stars ?? 0);
    return { ...base, author_reputation: authorReputation };
  });

  // Normalize each dimension across the batch
  const dimensions: (keyof ScoreDetail)[] = ['star_velocity', 'activity', 'fork_ratio', 'author_reputation', 'issue_health'];
  const normalized = rawScores.map((s) => ({ ...s }));

  for (const dim of dimensions) {
    const values = normalized.map((s) => s[dim]);
    const normed = normalize(values);
    normalized.forEach((s, i) => { s[dim] = normed[i]; });
  }

  // Compute final scores
  return normalized.map((detail) => ({
    score: computeScore(detail, weights),
    detail,
  }));
}

