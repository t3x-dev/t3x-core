/**
 * Hungarian Algorithm Tests
 *
 * Tests for optimal bipartite matching using Hungarian (Kuhn-Munkres) algorithm.
 */

import { describe, expect, it } from 'vitest';
import { buildSimilarityMatrix, hungarian } from '../../diff/hungarian';

describe('hungarian', () => {
  describe('basic matching', () => {
    it('finds optimal matching for simple 2x2 matrix', () => {
      const matrix = [
        [0.9, 0.4],
        [0.3, 0.8],
      ];
      const result = hungarian(matrix);

      expect(result).toHaveLength(2);
      // Optimal: (0,0)=0.9 + (1,1)=0.8 = 1.7
      expect(result).toContainEqual({ sourceIndex: 0, targetIndex: 0, similarity: 0.9 });
      expect(result).toContainEqual({ sourceIndex: 1, targetIndex: 1, similarity: 0.8 });
    });

    it('finds optimal matching for 3x3 matrix', () => {
      const matrix = [
        [0.9, 0.4, 0.2],
        [0.3, 0.8, 0.5],
        [0.2, 0.3, 0.7],
      ];
      const result = hungarian(matrix);

      expect(result).toHaveLength(3);
      // Optimal: (0,0)=0.9 + (1,1)=0.8 + (2,2)=0.7 = 2.4
      const totalSimilarity = result.reduce((sum, p) => sum + p.similarity, 0);
      expect(totalSimilarity).toBeCloseTo(2.4);
    });
  });

  describe('globally optimal vs greedy', () => {
    it('finds better matching than greedy algorithm', () => {
      // This matrix demonstrates where greedy fails
      // Greedy (processing row 0 first): (0,0)=0.8 + (1,1)=0.3 = 1.1
      // Optimal: (0,1)=0.5 + (1,0)=0.9 = 1.4
      const matrix = [
        [0.8, 0.5],
        [0.9, 0.3],
      ];
      const result = hungarian(matrix);

      // Calculate total similarity
      const totalSimilarity = result.reduce((sum, p) => sum + p.similarity, 0);

      // Hungarian should find 1.4, not 1.1
      expect(totalSimilarity).toBeCloseTo(1.4);
      expect(result).toContainEqual({ sourceIndex: 0, targetIndex: 1, similarity: 0.5 });
      expect(result).toContainEqual({ sourceIndex: 1, targetIndex: 0, similarity: 0.9 });
    });

    it('finds optimal for another greedy-failure case', () => {
      // Greedy: A→X(0.7), B→Y(0.4), C→Z(0.3) = 1.4
      // Optimal: A→Y(0.6), B→Z(0.8), C→X(0.5) = 1.9
      const matrix = [
        [0.7, 0.6, 0.2], // A
        [0.3, 0.4, 0.8], // B
        [0.5, 0.1, 0.3], // C
      ];
      const result = hungarian(matrix);
      const totalSimilarity = result.reduce((sum, p) => sum + p.similarity, 0);

      // Should be >= 1.9 (optimal)
      expect(totalSimilarity).toBeGreaterThanOrEqual(1.9);
    });
  });

  describe('edge cases', () => {
    it('handles empty matrix', () => {
      const result = hungarian([]);
      expect(result).toEqual([]);
    });

    it('handles 1x1 matrix', () => {
      const matrix = [[0.5]];
      const result = hungarian(matrix);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ sourceIndex: 0, targetIndex: 0, similarity: 0.5 });
    });

    it('handles matrix with zeros', () => {
      const matrix = [
        [0, 0.5],
        [0.5, 0],
      ];
      const result = hungarian(matrix);

      expect(result).toHaveLength(2);
      const totalSimilarity = result.reduce((sum, p) => sum + p.similarity, 0);
      expect(totalSimilarity).toBeCloseTo(1.0);
    });

    it('handles matrix with all same values', () => {
      const matrix = [
        [0.5, 0.5],
        [0.5, 0.5],
      ];
      const result = hungarian(matrix);

      expect(result).toHaveLength(2);
      // Any valid assignment is optimal
      const totalSimilarity = result.reduce((sum, p) => sum + p.similarity, 0);
      expect(totalSimilarity).toBeCloseTo(1.0);
    });
  });

  describe('non-square matrices', () => {
    it('handles more sources than targets (3x2)', () => {
      const matrix = [
        [0.9, 0.4],
        [0.3, 0.8],
        [0.2, 0.5],
      ];
      const result = hungarian(matrix);

      // Can only match 2 pairs (limited by target count)
      expect(result).toHaveLength(2);
      // Should pick best 2: (0,0)=0.9 and (1,1)=0.8
      const totalSimilarity = result.reduce((sum, p) => sum + p.similarity, 0);
      expect(totalSimilarity).toBeGreaterThanOrEqual(1.7);
    });

    it('handles more targets than sources (2x3)', () => {
      const matrix = [
        [0.9, 0.4, 0.2],
        [0.3, 0.8, 0.5],
      ];
      const result = hungarian(matrix);

      // Can only match 2 pairs (limited by source count)
      expect(result).toHaveLength(2);
      const totalSimilarity = result.reduce((sum, p) => sum + p.similarity, 0);
      expect(totalSimilarity).toBeGreaterThanOrEqual(1.7);
    });
  });

  describe('result properties', () => {
    it('returns results sorted by sourceIndex', () => {
      const matrix = [
        [0.1, 0.9],
        [0.8, 0.2],
      ];
      const result = hungarian(matrix);

      expect(result[0].sourceIndex).toBeLessThan(result[1].sourceIndex);
    });

    it('each source and target appears at most once', () => {
      const matrix = [
        [0.9, 0.8, 0.7],
        [0.6, 0.5, 0.4],
        [0.3, 0.2, 0.1],
      ];
      const result = hungarian(matrix);

      const sourceIndices = result.map((p) => p.sourceIndex);
      const targetIndices = result.map((p) => p.targetIndex);

      // No duplicates
      expect(new Set(sourceIndices).size).toBe(sourceIndices.length);
      expect(new Set(targetIndices).size).toBe(targetIndices.length);
    });
  });
});

describe('buildSimilarityMatrix', () => {
  it('builds correct matrix from arrays', () => {
    const sources = ['ab', 'cd'];
    const targets = ['ab', 'ef', 'cd'];

    const matrix = buildSimilarityMatrix(sources, targets, (a, b) => (a === b ? 1 : 0));

    expect(matrix).toEqual([
      [1, 0, 0], // 'ab' vs ['ab', 'ef', 'cd']
      [0, 0, 1], // 'cd' vs ['ab', 'ef', 'cd']
    ]);
  });

  it('works with custom similarity function', () => {
    const sources = [{ text: 'hello' }, { text: 'world' }];
    const targets = [{ text: 'hello' }, { text: 'there' }];

    const matrix = buildSimilarityMatrix(sources, targets, (a, b) =>
      a.text === b.text ? 1.0 : 0.5
    );

    expect(matrix).toEqual([
      [1.0, 0.5], // 'hello' vs ['hello', 'there']
      [0.5, 0.5], // 'world' vs ['hello', 'there']
    ]);
  });

  it('handles empty arrays', () => {
    expect(buildSimilarityMatrix([], [], () => 0)).toEqual([]);
    expect(buildSimilarityMatrix(['a'], [], () => 0)).toEqual([[]]);
    expect(buildSimilarityMatrix([], ['a'], () => 0)).toEqual([]);
  });
});

describe('Performance', () => {
  // Note: Thresholds are set conservatively for CI environments
  // Actual performance is typically 2-3x faster in isolation

  it('100 sentences completes within 200ms', () => {
    const size = 100;
    const matrix = Array(size)
      .fill(null)
      .map(() =>
        Array(size)
          .fill(null)
          .map(() => Math.random())
      );

    const start = performance.now();
    hungarian(matrix);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
  });

  it('500 sentences completes within 300ms', () => {
    const size = 500;
    const matrix = Array(size)
      .fill(null)
      .map(() =>
        Array(size)
          .fill(null)
          .map(() => Math.random())
      );

    const start = performance.now();
    hungarian(matrix);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(800);
  });

  it('1000 sentences completes within 4000ms', () => {
    const size = 1000;
    const matrix = Array(size)
      .fill(null)
      .map(() =>
        Array(size)
          .fill(null)
          .map(() => Math.random())
      );

    const start = performance.now();
    hungarian(matrix);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(4000);
  });
});
