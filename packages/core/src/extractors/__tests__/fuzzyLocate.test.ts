import { describe, expect, it } from 'vitest';
import { fuzzyLocate } from '../fuzzyLocate';

describe('fuzzyLocate', () => {
  const content = 'The user prefers dark mode for their development environment.';

  it('returns exact substring match', () => {
    const result = fuzzyLocate(content, 'dark mode');
    expect(result).toEqual({
      start: 17,
      end: 26,
      score: 1.0,
    });
  });

  it('returns normalized match (case-insensitive + whitespace)', () => {
    const result = fuzzyLocate(content, 'Dark  Mode');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0.95);
  });

  it('returns sliding window Levenshtein match for near-quotes', () => {
    // LLM slightly paraphrased the quote
    const result = fuzzyLocate(content, 'prefers dark modes for their');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0.8);
  });

  it('returns null when no match above threshold', () => {
    const result = fuzzyLocate(content, 'completely unrelated text about cooking');
    expect(result).toBeNull();
  });

  it('handles empty quote', () => {
    const result = fuzzyLocate(content, '');
    expect(result).toBeNull();
  });

  it('handles empty content', () => {
    const result = fuzzyLocate('', 'some quote');
    expect(result).toBeNull();
  });

  it('returns exact match for full content', () => {
    const result = fuzzyLocate(content, content);
    expect(result).toEqual({
      start: 0,
      end: content.length,
      score: 1.0,
    });
  });
});
