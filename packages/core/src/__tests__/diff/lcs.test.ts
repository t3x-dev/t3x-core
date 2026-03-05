/**
 * LCS and wordDiff Tests
 */

import { describe, expect, it } from 'vitest';
import { lcs, wordDiff } from '../../diff/lcs';

describe('lcs', () => {
  it('finds common subsequence', () => {
    expect(lcs(['the', 'quick', 'brown', 'fox'], ['the', 'slow', 'brown', 'dog'])).toEqual([
      'the',
      'brown',
    ]);
  });

  it('returns empty for no common elements', () => {
    expect(lcs(['a', 'b'], ['c', 'd'])).toEqual([]);
  });

  it('returns full array when identical', () => {
    expect(lcs(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('handles empty first array', () => {
    expect(lcs([], ['a', 'b'])).toEqual([]);
  });

  it('handles empty second array', () => {
    expect(lcs(['a', 'b'], [])).toEqual([]);
  });

  it('handles both empty', () => {
    expect(lcs([], [])).toEqual([]);
  });

  it('finds longest subsequence not just any', () => {
    // LCS = [a, b, c] (length 3), not just [a, c] (length 2)
    expect(lcs(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'e'])).toEqual(['a', 'b', 'c']);
  });

  it('handles single element arrays', () => {
    expect(lcs(['a'], ['a'])).toEqual(['a']);
    expect(lcs(['a'], ['b'])).toEqual([]);
  });
});

describe('wordDiff', () => {
  it('shows added and removed words', () => {
    const result = wordDiff('Budget is $3000', 'Budget is $3500');
    expect(result).toEqual([
      { type: 'unchanged', text: 'Budget' },
      { type: 'unchanged', text: 'is' },
      { type: 'removed', text: '3000' },
      { type: 'added', text: '3500' },
    ]);
  });

  it('returns all unchanged for identical strings', () => {
    const result = wordDiff('hello world', 'hello world');
    expect(result.every((s) => s.type === 'unchanged')).toBe(true);
  });

  it('returns all removed + all added for completely different strings', () => {
    const result = wordDiff('aaa bbb', 'ccc ddd');
    const types = result.map((s) => s.type);
    expect(types).toContain('removed');
    expect(types).toContain('added');
    expect(types).not.toContain('unchanged');
  });

  it('handles empty from string', () => {
    const result = wordDiff('', 'hello world');
    expect(result).toEqual([{ type: 'added', text: 'hello world' }]);
  });

  it('handles empty to string', () => {
    const result = wordDiff('hello world', '');
    expect(result).toEqual([{ type: 'removed', text: 'hello world' }]);
  });

  it('handles both empty', () => {
    expect(wordDiff('', '')).toEqual([]);
  });

  it('handles word insertion in middle', () => {
    const result = wordDiff('a c', 'a b c');
    const texts = result.map((s) => `${s.type}:${s.text}`);
    expect(texts).toContain('unchanged:a');
    expect(texts).toContain('added:b');
    expect(texts).toContain('unchanged:c');
  });

  it('handles word removal from middle', () => {
    const result = wordDiff('a b c', 'a c');
    const texts = result.map((s) => `${s.type}:${s.text}`);
    expect(texts).toContain('unchanged:a');
    expect(texts).toContain('removed:b');
    expect(texts).toContain('unchanged:c');
  });

  it('case-insensitive comparison preserving original case', () => {
    const result = wordDiff('Hello World', 'hello world');
    expect(result.every((s) => s.type === 'unchanged')).toBe(true);
  });
});
