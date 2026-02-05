/**
 * diffCommits Tests
 *
 * Tests the 4-stage commit diff pipeline:
 * Stage 1: Exact match, Stage 2: Jaccard matrix,
 * Stage 3: Hungarian matching, Stage 4: LCS + classify remainder.
 */

import { describe, expect, it } from 'vitest';
import { diffCommits } from '../../diff/diffCommits';
import type { DiffableSentence } from '../../diff/types';

function sent(id: string, text: string): DiffableSentence {
  return { id, text };
}

describe('diffCommits', () => {
  // ===========================================================================
  // Empty / trivial inputs
  // ===========================================================================
  describe('empty inputs', () => {
    it('returns empty diff for two empty arrays', () => {
      const result = diffCommits([], []);
      expect(result.identical).toEqual([]);
      expect(result.similar).toEqual([]);
      expect(result.onlyInSource).toEqual([]);
      expect(result.onlyInTarget).toEqual([]);
    });

    it('returns all as onlyInTarget when source is empty', () => {
      const target = [sent('t1', 'Hello world')];
      const result = diffCommits([], target);
      expect(result.onlyInTarget).toHaveLength(1);
      expect(result.onlyInTarget[0].text).toBe('Hello world');
      expect(result.identical).toHaveLength(0);
      expect(result.onlyInSource).toHaveLength(0);
    });

    it('returns all as onlyInSource when target is empty', () => {
      const source = [sent('s1', 'Hello world')];
      const result = diffCommits(source, []);
      expect(result.onlyInSource).toHaveLength(1);
      expect(result.onlyInSource[0].text).toBe('Hello world');
      expect(result.identical).toHaveLength(0);
      expect(result.onlyInTarget).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Stage 1: Exact match
  // ===========================================================================
  describe('exact matches', () => {
    it('identifies identical sentences', () => {
      const source = [sent('s1', 'Budget is $3000'), sent('s2', 'Timeline is Q1')];
      const target = [sent('t1', 'Budget is $3000'), sent('t2', 'Timeline is Q1')];
      const result = diffCommits(source, target);
      expect(result.identical).toHaveLength(2);
      expect(result.similar).toHaveLength(0);
      expect(result.onlyInSource).toHaveLength(0);
      expect(result.onlyInTarget).toHaveLength(0);
    });

    it('matches by text not by id', () => {
      const source = [sent('s1', 'Same text')];
      const target = [sent('t999', 'Same text')];
      const result = diffCommits(source, target);
      expect(result.identical).toHaveLength(1);
      expect(result.identical[0].id).toBe('s1');
    });

    it('handles partial overlap', () => {
      const source = [sent('s1', 'Shared'), sent('s2', 'The quick brown fox jumps')];
      const target = [sent('t1', 'Shared'), sent('t2', 'Lorem ipsum dolor sit amet')];
      const result = diffCommits(source, target);
      expect(result.identical).toHaveLength(1);
      // Completely different sentences → onlyIn*
      expect(result.onlyInSource).toHaveLength(1);
      expect(result.onlyInTarget).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Stage 2-3: Jaccard + Hungarian matching
  // ===========================================================================
  describe('similar sentence matching', () => {
    it('detects similar sentences above Jaccard threshold', () => {
      const source = [sent('s1', 'Budget is $3000')];
      const target = [sent('t1', 'Budget is $3500')];
      const result = diffCommits(source, target);
      expect(result.similar).toHaveLength(1);
      expect(result.similar[0].source.id).toBe('s1');
      expect(result.similar[0].target.id).toBe('t1');
      expect(result.similar[0].similarity).toBeGreaterThanOrEqual(0.3);
    });

    it('classifies completely different sentences as onlyIn*', () => {
      const source = [sent('s1', 'The quick brown fox')];
      const target = [sent('t1', 'Lorem ipsum dolor sit amet')];
      const result = diffCommits(source, target);
      // Very low similarity — should NOT be paired
      expect(result.similar).toHaveLength(0);
      expect(result.onlyInSource).toHaveLength(1);
      expect(result.onlyInTarget).toHaveLength(1);
    });

    it('provides word diff for similar pairs', () => {
      const source = [sent('s1', 'Budget is $3000')];
      const target = [sent('t1', 'Budget is $3500')];
      const result = diffCommits(source, target);
      expect(result.similar[0].wordDiff).toBeDefined();
      expect(result.similar[0].wordDiff.length).toBeGreaterThan(0);
      const types = result.similar[0].wordDiff.map((d) => d.type);
      expect(types).toContain('unchanged');
      expect(types).toContain('removed');
      expect(types).toContain('added');
    });
  });

  // ===========================================================================
  // Complex scenarios
  // ===========================================================================
  describe('complex scenarios', () => {
    it('handles mix of identical, similar, and unique sentences', () => {
      const source = [
        sent('s1', 'The project uses React'),
        sent('s2', 'Budget is $3000 per month'),
        sent('s3', 'Deadline is March 2024'),
      ];
      const target = [
        sent('t1', 'The project uses React'),
        sent('t2', 'Budget is $3500 per month'),
        sent('t3', 'Team size is 5 people'),
      ];
      const result = diffCommits(source, target);

      expect(result.identical).toHaveLength(1);
      expect(result.identical[0].text).toBe('The project uses React');

      expect(result.similar).toHaveLength(1);
      expect(result.similar[0].source.text).toContain('$3000');
      expect(result.similar[0].target.text).toContain('$3500');

      expect(result.onlyInSource).toHaveLength(1);
      expect(result.onlyInSource[0].text).toContain('Deadline');

      expect(result.onlyInTarget).toHaveLength(1);
      expect(result.onlyInTarget[0].text).toContain('Team size');
    });

    it('handles multiple similar pairs correctly', () => {
      const source = [sent('s1', 'Budget is $3000'), sent('s2', 'Revenue is $5000')];
      const target = [sent('t1', 'Budget is $3500'), sent('t2', 'Revenue is $5500')];
      const result = diffCommits(source, target);
      expect(result.similar).toHaveLength(2);
    });

    it('preserves source_ref through diff', () => {
      const sourceRef = {
        conversation_id: 'conv_1',
        turn_hash: 'sha256:abc',
        start_char: 0,
        end_char: 10,
      };
      const source = [{ id: 's1', text: 'Hello world', source_ref: sourceRef }];
      const target = [{ id: 't1', text: 'Hello world' }];
      const result = diffCommits(source, target);
      expect(result.identical[0].source_ref).toEqual(sourceRef);
    });

    it('handles single sentence on each side', () => {
      const source = [sent('s1', 'Alpha beta gamma')];
      const target = [sent('t1', 'Alpha beta delta')];
      const result = diffCommits(source, target);
      // Should match as similar (2/3 words shared)
      expect(result.similar).toHaveLength(1);
    });
  });
});
