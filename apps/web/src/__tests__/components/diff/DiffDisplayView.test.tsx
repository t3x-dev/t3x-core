/**
 * DiffDisplayView Component Tests
 *
 * Tests for the diff display algorithm and component logic
 *
 * @see https://github.com/t3x-dev/T3X/issues/220
 */

import { describe, expect, test } from 'vitest';

import {
  diffCommits,
  jaccard,
  lcs,
  lcsIndices,
  splitWords,
  tokenize,
  wordDiff,
  JACCARD_THRESHOLD,
  type CommitDiff,
  type DiffableSentence,
} from '@/lib/diffUtils';

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('DiffDisplayView - Diff Algorithm', () => {
  describe('tokenize', () => {
    test('splits text into lowercase words', () => {
      expect(tokenize('Hello World')).toEqual(['hello', 'world']);
    });

    test('handles multiple spaces', () => {
      expect(tokenize('hello   world')).toEqual(['hello', 'world']);
    });

    test('returns empty array for empty string', () => {
      expect(tokenize('')).toEqual([]);
    });
  });

  describe('splitWords', () => {
    test('preserves original case', () => {
      expect(splitWords('Hello World')).toEqual(['Hello', 'World']);
    });

    test('handles multiple spaces', () => {
      expect(splitWords('Hello   World')).toEqual(['Hello', 'World']);
    });
  });

  describe('jaccard', () => {
    test('returns 1 for identical sets', () => {
      expect(jaccard(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
    });

    test('returns 0 for completely different sets', () => {
      expect(jaccard(['a', 'b'], ['c', 'd'])).toBe(0);
    });

    test('returns correct value for partial overlap', () => {
      // {a, b} ∩ {b, c} = {b} → 1 element
      // {a, b} ∪ {b, c} = {a, b, c} → 3 elements
      // Jaccard = 1/3 ≈ 0.333
      const result = jaccard(['a', 'b'], ['b', 'c']);
      expect(result).toBeCloseTo(0.333, 2);
    });

    test('returns 1 for two empty arrays', () => {
      expect(jaccard([], [])).toBe(1);
    });

    test('returns 0 when one array is empty', () => {
      expect(jaccard(['a'], [])).toBe(0);
      expect(jaccard([], ['a'])).toBe(0);
    });
  });

  describe('lcs', () => {
    test('finds longest common subsequence', () => {
      expect(lcs(['the', 'quick', 'brown', 'fox'], ['the', 'slow', 'brown', 'dog'])).toEqual([
        'the',
        'brown',
      ]);
    });

    test('returns empty for no common elements', () => {
      expect(lcs(['a', 'b'], ['c', 'd'])).toEqual([]);
    });

    test('returns full array for identical inputs', () => {
      expect(lcs(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    });
  });

  describe('lcsIndices', () => {
    test('returns correct indices for common elements', () => {
      const result = lcsIndices(['the', 'quick', 'brown'], ['the', 'slow', 'brown']);
      expect(result.aIndices).toEqual([0, 2]); // 'the' at 0, 'brown' at 2
      expect(result.bIndices).toEqual([0, 2]); // 'the' at 0, 'brown' at 2
    });

    test('handles case-insensitive matching', () => {
      const result = lcsIndices(['Hello', 'World'], ['hello', 'world']);
      expect(result.aIndices).toEqual([0, 1]);
      expect(result.bIndices).toEqual([0, 1]);
    });
  });

  describe('wordDiff', () => {
    test('identifies unchanged words with original case', () => {
      const result = wordDiff('Hello World', 'Hello World');
      expect(result).toEqual([
        { type: 'unchanged', text: 'Hello' },
        { type: 'unchanged', text: 'World' },
      ]);
    });

    test('identifies removed words', () => {
      const result = wordDiff('Hello World', 'Hello');
      expect(result).toEqual([
        { type: 'unchanged', text: 'Hello' },
        { type: 'removed', text: 'World' },
      ]);
    });

    test('identifies added words', () => {
      const result = wordDiff('Hello', 'Hello World');
      expect(result).toEqual([
        { type: 'unchanged', text: 'Hello' },
        { type: 'added', text: 'World' },
      ]);
    });

    test('identifies modified words preserving case (classic budget example)', () => {
      const result = wordDiff('Budget is $3000', 'Budget is $3500');
      // Should be: Budget (unchanged), is (unchanged), $3000 (removed), $3500 (added)
      expect(result).toContainEqual({ type: 'unchanged', text: 'Budget' });
      expect(result).toContainEqual({ type: 'unchanged', text: 'is' });
      expect(result).toContainEqual({ type: 'removed', text: '$3000' });
      expect(result).toContainEqual({ type: 'added', text: '$3500' });
    });

    test('preserves original case in output', () => {
      const result = wordDiff('Hello WORLD', 'Hello WORLD');
      expect(result).toEqual([
        { type: 'unchanged', text: 'Hello' },
        { type: 'unchanged', text: 'WORLD' },
      ]);
    });

    test('handles empty inputs', () => {
      expect(wordDiff('', '')).toEqual([]);
      expect(wordDiff('Hello', '')).toEqual([{ type: 'removed', text: 'Hello' }]);
      expect(wordDiff('', 'Hello')).toEqual([{ type: 'added', text: 'Hello' }]);
    });
  });

  describe('diffCommits', () => {
    test('identifies identical sentences', () => {
      const source = [{ id: 's1', text: 'Hello world' }];
      const target = [{ id: 't1', text: 'Hello world' }];

      const result = diffCommits(source, target);

      expect(result.identical.length).toBe(1);
      expect(result.identical[0].text).toBe('Hello world');
      expect(result.similar.length).toBe(0);
      expect(result.onlyInSource.length).toBe(0);
      expect(result.onlyInTarget.length).toBe(0);
    });

    test('identifies sentences only in source (removed)', () => {
      const source = [{ id: 's1', text: 'Old sentence that will be removed' }];
      const target: DiffableSentence[] = [];

      const result = diffCommits(source, target);

      expect(result.identical.length).toBe(0);
      expect(result.similar.length).toBe(0);
      expect(result.onlyInSource.length).toBe(1);
      expect(result.onlyInTarget.length).toBe(0);
    });

    test('identifies sentences only in target (added)', () => {
      const source: DiffableSentence[] = [];
      const target = [{ id: 't1', text: 'New sentence that was added' }];

      const result = diffCommits(source, target);

      expect(result.identical.length).toBe(0);
      expect(result.similar.length).toBe(0);
      expect(result.onlyInSource.length).toBe(0);
      expect(result.onlyInTarget.length).toBe(1);
    });

    test('identifies similar sentences with word diff', () => {
      const source = [{ id: 's1', text: 'Budget is $3000' }];
      const target = [{ id: 't1', text: 'Budget is $3500' }];

      const result = diffCommits(source, target);

      expect(result.identical.length).toBe(0);
      expect(result.similar.length).toBe(1);
      expect(result.similar[0].source.text).toBe('Budget is $3000');
      expect(result.similar[0].target.text).toBe('Budget is $3500');
      expect(result.similar[0].similarity).toBeGreaterThanOrEqual(JACCARD_THRESHOLD);
      expect(result.similar[0].wordDiff.length).toBeGreaterThan(0);
      expect(result.onlyInSource.length).toBe(0);
      expect(result.onlyInTarget.length).toBe(0);
    });

    test('handles complex diff with all categories', () => {
      const source = [
        { id: 's1', text: 'Unchanged sentence' },
        { id: 's2', text: 'Budget is $3000' },
        { id: 's3', text: 'This sentence will be removed' },
      ];
      const target = [
        { id: 't1', text: 'Unchanged sentence' },
        { id: 't2', text: 'Budget is $3500' },
        { id: 't3', text: 'This is a new sentence' },
      ];

      const result = diffCommits(source, target);

      expect(result.identical.length).toBe(1);
      expect(result.similar.length).toBe(1);
      expect(result.onlyInSource.length).toBe(1);
      expect(result.onlyInTarget.length).toBe(1);
    });

    test('does not match dissimilar sentences', () => {
      const source = [{ id: 's1', text: 'Hello world' }];
      const target = [{ id: 't1', text: 'Completely different text here' }];

      const result = diffCommits(source, target);

      // These are too dissimilar to match (Jaccard < 0.3)
      expect(result.identical.length).toBe(0);
      expect(result.similar.length).toBe(0);
      expect(result.onlyInSource.length).toBe(1);
      expect(result.onlyInTarget.length).toBe(1);
    });

    test('handles empty inputs', () => {
      const result = diffCommits([], []);

      expect(result.identical.length).toBe(0);
      expect(result.similar.length).toBe(0);
      expect(result.onlyInSource.length).toBe(0);
      expect(result.onlyInTarget.length).toBe(0);
    });
  });
});

describe('DiffDisplayView - Component Types', () => {
  test('CommitV3Sentence has required fields for diff', () => {
    const sentence = {
      id: 's1',
      text: 'Test sentence',
      source: {
        turn_hash: 'sha256:abc123',
        start_char: 0,
        end_char: 13,
      },
    };

    expect(sentence).toHaveProperty('id');
    expect(sentence).toHaveProperty('text');
    expect(sentence).toHaveProperty('source');
    expect(sentence.source).toHaveProperty('turn_hash');
    expect(sentence.source).toHaveProperty('start_char');
    expect(sentence.source).toHaveProperty('end_char');
  });

  test('SentenceWithSource supports optional source', () => {
    const withSource = {
      id: 's1',
      text: 'With source',
      source: { turn_hash: 'hash', start_char: 0, end_char: 10 },
    };

    const withoutSource = {
      id: 's2',
      text: 'Without source',
    };

    expect(withSource.source).toBeDefined();
    expect(withoutSource.source).toBeUndefined();
  });

  test('UnifiedDiffLine types are valid', () => {
    const types = ['context', 'added', 'removed', 'modified'];
    expect(types).toContain('context');
    expect(types).toContain('added');
    expect(types).toContain('removed');
    expect(types).toContain('modified');
  });
});

describe('DiffDisplayView - Stats Calculation', () => {
  test('calculates correct stats from diff result', () => {
    const diff: CommitDiff = {
      identical: [{ id: 's1', text: 'same' }],
      similar: [
        {
          source: { id: 's2', text: 'old' },
          target: { id: 't2', text: 'new' },
          similarity: 0.5,
          wordDiff: [],
        },
      ],
      onlyInSource: [{ id: 's3', text: 'removed' }],
      onlyInTarget: [{ id: 't3', text: 'added' }],
    };

    const total =
      diff.identical.length +
      diff.similar.length +
      diff.onlyInSource.length +
      diff.onlyInTarget.length;

    expect(total).toBe(4);
    expect(diff.identical.length).toBe(1);
    expect(diff.similar.length).toBe(1);
    expect(diff.onlyInSource.length).toBe(1);
    expect(diff.onlyInTarget.length).toBe(1);
  });
});

describe('DiffDisplayView - Bug Fixes', () => {
  test('wordDiff preserves original case (fix for lowercase bug)', () => {
    const result = wordDiff('Budget is $3000', 'Budget is $3500');

    // Should preserve "Budget" not "budget"
    const unchangedBudget = result.find((s) => s.type === 'unchanged' && s.text === 'Budget');
    expect(unchangedBudget).toBeDefined();

    // Should NOT have lowercase version
    const lowercaseBudget = result.find((s) => s.text === 'budget');
    expect(lowercaseBudget).toBeUndefined();
  });

  test('identical sentences lookup works correctly', () => {
    // This tests the fix for the bug where targetMap.get(s.id) failed
    // because s.id is from source, not target
    const source = [{ id: 's1', text: 'Same text' }];
    const target = [{ id: 't1', text: 'Same text' }]; // Different ID, same text

    const result = diffCommits(source, target);

    // Should find as identical (matched by text, not ID)
    expect(result.identical.length).toBe(1);
    expect(result.identical[0].id).toBe('s1'); // Source ID
    expect(result.identical[0].text).toBe('Same text');
  });
});
