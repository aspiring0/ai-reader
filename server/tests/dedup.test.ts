import { describe, it, expect } from 'vitest';
import { normalizeUrl, jaccardSimilarity, dedup } from '../src/collectors/dedup.js';

describe('normalizeUrl', () => {
  it('should normalize protocol and trailing slash', () => {
    expect(normalizeUrl('https://github.com/openai/codex/')).toBe('github.com/openai/codex');
    expect(normalizeUrl('HTTP://GitHub.COM/Repo/')).toBe('github.com/repo');
  });

  it('should remove www prefix', () => {
    expect(normalizeUrl('https://www.example.com/page')).toBe('example.com/page');
  });

  it('should remove fragments', () => {
    expect(normalizeUrl('https://example.com/page#section')).toBe('example.com/page');
  });

  it('should remove .git suffix', () => {
    expect(normalizeUrl('https://github.com/user/repo.git')).toBe('github.com/user/repo');
  });

  it('should treat http and https versions as same', () => {
    expect(normalizeUrl('http://example.com')).toBe(normalizeUrl('https://example.com'));
  });
});

describe('jaccardSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('should return 0 for completely different strings', () => {
    expect(jaccardSimilarity('apple', 'banana')).toBe(0);
  });

  it('should return partial similarity', () => {
    const sim = jaccardSimilarity('the quick brown fox', 'the quick red fox');
    expect(sim).toBeGreaterThan(0.5);
    expect(sim).toBeLessThan(1);
  });

  it('should return 0 for empty strings', () => {
    expect(jaccardSimilarity('', 'hello')).toBe(0);
  });
});

describe('dedup', () => {
  it('should remove exact URL duplicates', () => {
    const items = [
      { url: 'https://github.com/a/b', title: 'A', stars: 100 },
      { url: 'https://github.com/a/b/', title: 'A copy', stars: 50 },
    ];
    expect(dedup(items)).toHaveLength(1);
    expect(dedup(items)[0].stars).toBe(100);
  });

  it('should keep items with different URLs', () => {
    const items = [
      { url: 'https://github.com/a/b', title: 'A' },
      { url: 'https://github.com/c/d', title: 'B' },
    ];
    expect(dedup(items)).toHaveLength(2);
  });

  it('should remove items with very similar titles', () => {
    const items = [
      { url: 'https://example.com/1', title: 'Awesome AI Agent Framework', stars: 200 },
      { url: 'https://example.com/2', title: 'Awesome AI Agent Framework', stars: 100 },
    ];
    expect(dedup(items)).toHaveLength(1);
  });

  it('should keep higher starred item when duplicates found', () => {
    const items = [
      { url: 'https://github.com/x/y', title: 'Test', stars: 10 },
      { url: 'https://github.com/x/y', title: 'Test', stars: 500 },
    ];
    expect(dedup(items)).toHaveLength(1);
    expect(dedup(items)[0].stars).toBe(500);
  });
});
