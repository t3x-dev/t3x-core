/**
 * Jaccard Similarity Tests
 */

import { describe, expect, it } from 'vitest';
import { JACCARD_THRESHOLD, jaccard } from '../../diff/jaccard';

describe('jaccard', () => {
  it('returns 1 for identical token sets', () => {
    expect(jaccard(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  it('returns 0 for completely disjoint sets', () => {
    expect(jaccard(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('returns 0 for two empty arrays', () => {
    expect(jaccard([], [])).toBe(0);
  });

  it('returns 0 when one array is empty', () => {
    expect(jaccard(['a'], [])).toBe(0);
    expect(jaccard([], ['b'])).toBe(0);
  });

  it('computes correct partial overlap', () => {
    // intersection = {budget, is} = 2
    // union = {budget, is, $3000, $3500} = 4
    // => 2/4 = 0.5
    expect(jaccard(['budget', 'is', '$3000'], ['budget', 'is', '$3500'])).toBe(0.5);
  });

  it('handles single-element overlap', () => {
    // intersection = {a} = 1, union = {a, b, c} = 3 => 1/3
    expect(jaccard(['a', 'b'], ['a', 'c'])).toBeCloseTo(1 / 3);
  });

  it('is symmetric', () => {
    const a = ['the', 'quick', 'fox'];
    const b = ['the', 'slow', 'fox'];
    expect(jaccard(a, b)).toBe(jaccard(b, a));
  });

  it('treats duplicate tokens as set (deduped)', () => {
    // Set A = {a, b}, Set B = {a, b} => 1.0
    expect(jaccard(['a', 'a', 'b'], ['a', 'b', 'b'])).toBe(1);
  });
});

describe('JACCARD_THRESHOLD', () => {
  it('is 0.3', () => {
    expect(JACCARD_THRESHOLD).toBe(0.3);
  });
});
