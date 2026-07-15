import { describe, it, expect } from 'vitest';
import {
  calculateRawScores,
  calculateAuthorScore,
  normalize,
  computeScore,
  scoreItems,
  getDefaultWeights,
} from '../src/scorer/index.js';
import type { ScoreDetail, ScoreWeights } from '@shared/types';

describe('calculateRawScores', () => {
  it('should use log approximation when no stars_prev', () => {
    const result = calculateRawScores({
      stars: 1000, stars_prev: null, forks: 100,
      pushed_at: new Date().toISOString(), collected_at: null,
    });
    expect(result.star_velocity).toBeGreaterThan(0);
    expect(result.star_velocity).toBeLessThanOrEqual(1);
  });

  it('should compute velocity from snapshot when stars_prev exists', () => {
    const recent = new Date();
    const result = calculateRawScores({
      stars: 200, stars_prev: 100, forks: 20,
      pushed_at: new Date().toISOString(),
      collected_at: recent.toISOString(),
    });
    expect(result.star_velocity).toBeGreaterThan(0);
  });

  it('should return high activity for recently pushed', () => {
    const result = calculateRawScores({
      stars: 100, stars_prev: null, forks: 10,
      pushed_at: new Date().toISOString(), collected_at: null,
    });
    expect(result.activity).toBeGreaterThan(0.9);
  });

  it('should return low activity for stale repo', () => {
    const old = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(); // 120 days ago
    const result = calculateRawScores({
      stars: 100, stars_prev: null, forks: 10,
      pushed_at: old, collected_at: null,
    });
    expect(result.activity).toBeLessThan(0.1);
  });

  it('should return zero activity for no push date', () => {
    const result = calculateRawScores({
      stars: 100, stars_prev: null, forks: 10,
      pushed_at: null, collected_at: null,
    });
    expect(result.activity).toBe(0);
  });

  it('should score fork ratio peak at 0.1', () => {
    const result = calculateRawScores({
      stars: 1000, stars_prev: null, forks: 100, // ratio = 0.1
      pushed_at: new Date().toISOString(), collected_at: null,
    });
    expect(result.fork_ratio).toBe(1);
  });

  it('should penalize tutorial-type repos (fork/star > 0.5)', () => {
    const result = calculateRawScores({
      stars: 100, stars_prev: null, forks: 80, // ratio = 0.8
      pushed_at: new Date().toISOString(), collected_at: null,
    });
    expect(result.fork_ratio).toBeLessThan(0.5);
  });

  it('should compute issue health ratio', () => {
    const result = calculateRawScores({
      stars: 100, stars_prev: null, forks: 10,
      pushed_at: new Date().toISOString(), collected_at: null,
      open_issues: 30, closed_issues: 70,
    });
    expect(result.issue_health).toBeCloseTo(0.7, 1);
  });

  it('should return neutral issue health when no data', () => {
    const result = calculateRawScores({
      stars: 100, stars_prev: null, forks: 10,
      pushed_at: new Date().toISOString(), collected_at: null,
    });
    expect(result.issue_health).toBe(0.5);
  });
});

describe('calculateAuthorScore', () => {
  it('should return 0 for zero stars', () => {
    expect(calculateAuthorScore(0)).toBe(0);
  });

  it('should return higher score for more stars', () => {
    expect(calculateAuthorScore(50000)).toBeGreaterThan(calculateAuthorScore(100));
  });

  it('should be capped at 1', () => {
    expect(calculateAuthorScore(99999999)).toBeLessThanOrEqual(1);
  });
});

describe('normalize', () => {
  it('should normalize to [0,1] range', () => {
    const result = normalize([10, 20, 30, 40, 50]);
    expect(result[0]).toBe(0);
    expect(result[4]).toBe(1);
    expect(result[2]).toBe(0.5);
  });

  it('should return all 1 for identical values', () => {
    const result = normalize([5, 5, 5]);
    expect(result.every((v) => v === 1)).toBe(true);
  });

  it('should handle empty array', () => {
    expect(normalize([])).toEqual([]);
  });
});

describe('computeScore', () => {
  it('should produce a 0-100 score', () => {
    const detail: ScoreDetail = {
      star_velocity: 0.8, activity: 0.7, fork_ratio: 0.6,
      author_reputation: 0.5, issue_health: 0.9,
    };
    const weights = getDefaultWeights();
    const score = computeScore(detail, weights);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should be higher with better scores', () => {
    const high: ScoreDetail = { star_velocity: 1, activity: 1, fork_ratio: 1, author_reputation: 1, issue_health: 1 };
    const low: ScoreDetail = { star_velocity: 0, activity: 0, fork_ratio: 0, author_reputation: 0, issue_health: 0 };
    const weights = getDefaultWeights();
    expect(computeScore(high, weights)).toBeGreaterThan(computeScore(low, weights));
  });

  it('should respond to weight changes', () => {
    const detail: ScoreDetail = { star_velocity: 1, activity: 0, fork_ratio: 0, author_reputation: 0, issue_health: 0 };
    const velocityHeavy: ScoreWeights = { star_velocity: 1, activity: 0, fork_ratio: 0, author_reputation: 0, issue_health: 0 };
    const activityHeavy: ScoreWeights = { star_velocity: 0, activity: 1, fork_ratio: 0, author_reputation: 0, issue_health: 0 };
    expect(computeScore(detail, velocityHeavy)).toBe(100);
    expect(computeScore(detail, activityHeavy)).toBe(0);
  });
});

describe('scoreItems', () => {
  it('should score and normalize across batch', () => {
    const items = [
      { stars: 50000, stars_prev: null, forks: 1000, pushed_at: new Date().toISOString(), collected_at: null, author_max_stars: 50000 },
      { stars: 100, stars_prev: null, forks: 5, pushed_at: new Date(Date.now() - 60*86400000).toISOString(), collected_at: null, author_max_stars: 100 },
    ];
    const results = scoreItems(items);
    expect(results).toHaveLength(2);
    expect(results[0].score).toBeGreaterThanOrEqual(0);
    expect(results[1].score).toBeGreaterThanOrEqual(0);
    // First item should generally score higher
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it('should handle single item (all normalize to 1)', () => {
    const items = [
      { stars: 1000, stars_prev: null, forks: 100, pushed_at: new Date().toISOString(), collected_at: null, author_max_stars: 1000 },
    ];
    const results = scoreItems(items);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should handle empty array', () => {
    expect(scoreItems([])).toEqual([]);
  });
});
