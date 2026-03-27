// @ts-nocheck — tree-primary migration: test needs rework
import { describe, expect, it } from 'vitest';
import type { TreeNode } from '@/lib/diffUtils';
import {
  diffCommits,
  JACCARD_THRESHOLD,
  jaccard,
  lcs,
  lcsIndices,
  splitWords,
  tokenize,
  wordDiff,
} from '@/lib/diffUtils';

describe('diffUtils', () => {
  // =========================================================================
  // splitWords
  // =========================================================================
  describe('splitWords', () => {
    it('splits on whitespace', () => {
      expect(splitWords('hello world')).toEqual(['hello', 'world']);
    });

    it('preserves original case', () => {
      expect(splitWords('Hello World')).toEqual(['Hello', 'World']);
    });

    it('handles multiple spaces', () => {
      expect(splitWords('a  b   c')).toEqual(['a', 'b', 'c']);
    });

    it('returns empty array for empty string', () => {
      expect(splitWords('')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
      expect(splitWords('   ')).toEqual([]);
    });
  });

  // =========================================================================
  // tokenize
  // =========================================================================
  describe('tokenize', () => {
    it('lowercases and splits', () => {
      expect(tokenize('Hello World')).toEqual(['hello', 'world']);
    });

    it('handles mixed case', () => {
      expect(tokenize('CamelCase UPPER lower')).toEqual(['camelcase', 'upper', 'lower']);
    });

    it('returns empty for empty string', () => {
      expect(tokenize('')).toEqual([]);
    });
  });

  // =========================================================================
  // jaccard
  // =========================================================================
  describe('jaccard', () => {
    it('returns 1 for identical sets', () => {
      expect(jaccard(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
    });

    it('returns 0 for completely different sets', () => {
      expect(jaccard(['a', 'b'], ['c', 'd'])).toBe(0);
    });

    it('returns 1 for both empty', () => {
      expect(jaccard([], [])).toBe(1);
    });

    it('returns 0 when one is empty', () => {
      expect(jaccard(['a'], [])).toBe(0);
      expect(jaccard([], ['a'])).toBe(0);
    });

    it('calculates partial overlap correctly', () => {
      // {a, b, c} ∩ {b, c, d} = {b, c}, union = {a, b, c, d}
      expect(jaccard(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(2 / 4);
    });

    it('handles duplicates via Set dedup', () => {
      // Set{a, b} ∩ Set{a, b} = {a, b}
      expect(jaccard(['a', 'a', 'b'], ['a', 'b', 'b'])).toBe(1);
    });

    it('JACCARD_THRESHOLD is 0.3', () => {
      expect(JACCARD_THRESHOLD).toBe(0.3);
    });
  });

  // =========================================================================
  // lcsIndices
  // =========================================================================
  describe('lcsIndices', () => {
    it('finds common subsequence indices', () => {
      const { aIndices, bIndices } = lcsIndices(['a', 'b', 'c'], ['a', 'c']);
      expect(aIndices).toEqual([0, 2]);
      expect(bIndices).toEqual([0, 1]);
    });

    it('handles empty arrays', () => {
      const { aIndices, bIndices } = lcsIndices([], ['a']);
      expect(aIndices).toEqual([]);
      expect(bIndices).toEqual([]);
    });

    it('case-insensitive matching', () => {
      const { aIndices } = lcsIndices(['Hello', 'WORLD'], ['hello', 'world']);
      expect(aIndices).toEqual([0, 1]);
    });

    it('handles no common elements', () => {
      const { aIndices, bIndices } = lcsIndices(['a', 'b'], ['c', 'd']);
      expect(aIndices).toEqual([]);
      expect(bIndices).toEqual([]);
    });
  });

  // =========================================================================
  // lcs
  // =========================================================================
  describe('lcs', () => {
    it('returns lowercase common subsequence', () => {
      expect(lcs(['Hello', 'World'], ['hello', 'world'])).toEqual(['hello', 'world']);
    });

    it('returns empty for no common elements', () => {
      expect(lcs(['a'], ['b'])).toEqual([]);
    });

    it('handles empty input', () => {
      expect(lcs([], [])).toEqual([]);
    });
  });

  // =========================================================================
  // wordDiff
  // =========================================================================
  describe('wordDiff', () => {
    it('returns empty for identical strings', () => {
      const diff = wordDiff('hello world', 'hello world');
      expect(diff.every((s) => s.type === 'unchanged')).toBe(true);
      expect(diff.map((s) => s.text).join(' ')).toBe('hello world');
    });

    it('detects added words', () => {
      const diff = wordDiff('hello', 'hello world');
      const types = diff.map((s) => s.type);
      expect(types).toContain('unchanged');
      expect(types).toContain('added');
    });

    it('detects removed words', () => {
      const diff = wordDiff('hello world', 'hello');
      const types = diff.map((s) => s.type);
      expect(types).toContain('unchanged');
      expect(types).toContain('removed');
    });

    it('detects changed words', () => {
      const diff = wordDiff('Budget is $3000', 'Budget is $3500');
      const unchanged = diff.filter((s) => s.type === 'unchanged');
      const removed = diff.filter((s) => s.type === 'removed');
      const added = diff.filter((s) => s.type === 'added');

      expect(unchanged.map((s) => s.text)).toEqual(['Budget', 'is']);
      expect(removed[0].text).toBe('$3000');
      expect(added[0].text).toBe('$3500');
    });

    it('preserves original case in unchanged segments', () => {
      const diff = wordDiff('Hello World', 'Hello World');
      expect(diff[0].text).toBe('Hello');
      expect(diff[1].text).toBe('World');
    });

    it('handles empty from string', () => {
      const diff = wordDiff('', 'hello');
      expect(diff).toHaveLength(1);
      expect(diff[0].type).toBe('added');
    });

    it('handles empty to string', () => {
      const diff = wordDiff('hello', '');
      expect(diff).toHaveLength(1);
      expect(diff[0].type).toBe('removed');
    });

    it('handles both empty', () => {
      const diff = wordDiff('', '');
      expect(diff).toHaveLength(0);
    });
  });

  // =========================================================================
  // diffCommits
  // =========================================================================
  describe('diffCommits', () => {
    const s = (id: string, text: string): TreeNode => ({ id, text });

    it('identifies identical sentences', () => {
      const source = [s('s1', 'Hello world'), s('s2', 'Goodbye')];
      const target = [s('t1', 'Hello world'), s('t2', 'Goodbye')];
      const diff = diffCommits(source, target);

      expect(diff.identical).toHaveLength(2);
      expect(diff.similar).toHaveLength(0);
      expect(diff.onlyInSource).toHaveLength(0);
      expect(diff.onlyInTarget).toHaveLength(0);
    });

    it('identifies only-in-source sentences', () => {
      const source = [s('s1', 'Hello'), s('s2', 'Unique source')];
      const target = [s('t1', 'Hello')];
      const diff = diffCommits(source, target);

      expect(diff.identical).toHaveLength(1);
      expect(diff.onlyInSource).toHaveLength(1);
      expect(diff.onlyInSource[0].text).toBe('Unique source');
    });

    it('identifies only-in-target sentences', () => {
      const source = [s('s1', 'Hello')];
      const target = [s('t1', 'Hello'), s('t2', 'New addition')];
      const diff = diffCommits(source, target);

      expect(diff.identical).toHaveLength(1);
      expect(diff.onlyInTarget).toHaveLength(1);
      expect(diff.onlyInTarget[0].text).toBe('New addition');
    });

    it('identifies similar sentences above Jaccard threshold', () => {
      const source = [s('s1', 'The budget is three thousand dollars')];
      const target = [s('t1', 'The budget is five thousand dollars')];
      const diff = diffCommits(source, target);

      expect(diff.identical).toHaveLength(0);
      expect(diff.similar).toHaveLength(1);
      expect(diff.similar[0].source.id).toBe('s1');
      expect(diff.similar[0].target.id).toBe('t1');
      expect(diff.similar[0].similarity).toBeGreaterThanOrEqual(JACCARD_THRESHOLD);
      expect(diff.similar[0].wordDiff.length).toBeGreaterThan(0);
    });

    it('classifies completely different sentences as onlyIn*', () => {
      const source = [s('s1', 'Alpha beta gamma')];
      const target = [s('t1', 'Completely different words here now')];
      const diff = diffCommits(source, target);

      // These should not match (Jaccard too low)
      expect(diff.similar).toHaveLength(0);
      expect(diff.onlyInSource).toHaveLength(1);
      expect(diff.onlyInTarget).toHaveLength(1);
    });

    it('handles empty source', () => {
      const diff = diffCommits([], [s('t1', 'Hello')]);
      expect(diff.identical).toHaveLength(0);
      expect(diff.onlyInTarget).toHaveLength(1);
    });

    it('handles empty target', () => {
      const diff = diffCommits([s('s1', 'Hello')], []);
      expect(diff.identical).toHaveLength(0);
      expect(diff.onlyInSource).toHaveLength(1);
    });

    it('handles both empty', () => {
      const diff = diffCommits([], []);
      expect(diff.identical).toHaveLength(0);
      expect(diff.similar).toHaveLength(0);
      expect(diff.onlyInSource).toHaveLength(0);
      expect(diff.onlyInTarget).toHaveLength(0);
    });

    it('mixed scenario: identical + similar + unique', () => {
      const source = [
        s('s1', 'Exact match sentence'),
        s('s2', 'Budget is three thousand dollars'),
        s('s3', 'Alpha beta gamma delta epsilon'),
      ];
      const target = [
        s('t1', 'Exact match sentence'),
        s('t2', 'Budget is five thousand dollars'),
        s('t3', 'Completely unique different words here'),
      ];
      const diff = diffCommits(source, target);

      expect(diff.identical).toHaveLength(1);
      expect(diff.identical[0].text).toBe('Exact match sentence');
      expect(diff.similar).toHaveLength(1);
      expect(diff.onlyInSource).toHaveLength(1);
      expect(diff.onlyInTarget).toHaveLength(1);
    });

    it('does not double-match similar sentences (greedy)', () => {
      const source = [s('s1', 'The cat sat on the mat'), s('s2', 'The cat ran on the mat')];
      const target = [s('t1', 'The cat sat on the rug')];
      const diff = diffCommits(source, target);

      // Only one source should be matched to the target
      expect(diff.similar).toHaveLength(1);
      expect(diff.onlyInSource).toHaveLength(1);
    });
  });
});
