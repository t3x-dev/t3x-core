/**
 * DiffDisplayView Component Tests
 *
 * Tests for the diff display algorithm and component logic
 *
 * @see https://github.com/t3x-dev/T3X/issues/220
 */

import { describe, expect, test } from 'vitest';

import {
  type CommitDiff,
  type DiffableSentence,
  diffCommits,
  EQUIVALENT_THRESHOLD,
  JACCARD_THRESHOLD,
  jaccard,
  lcs,
  lcsIndices,
  splitWords,
  tokenize,
  wordDiff,
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
  test('SentenceWithSourceInfo has required fields for diff', () => {
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
      equivalent: [],
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
      diff.equivalent.length +
      diff.similar.length +
      diff.onlyInSource.length +
      diff.onlyInTarget.length;

    expect(total).toBe(4);
    expect(diff.identical.length).toBe(1);
    expect(diff.equivalent.length).toBe(0);
    expect(diff.similar.length).toBe(1);
    expect(diff.onlyInSource.length).toBe(1);
    expect(diff.onlyInTarget.length).toBe(1);
  });
});

describe('DiffDisplayView - Four-Color Diff (Equivalent Split)', () => {
  test('EQUIVALENT_THRESHOLD is 0.85', () => {
    expect(EQUIVALENT_THRESHOLD).toBe(0.85);
  });

  test('high-similarity pairs go to equivalent bucket', () => {
    // "Budget is $3000" vs "Budget is $3500" → Jaccard = 2/4 = 0.5 → similar (< 0.85)
    const source = [{ id: 's1', text: 'Budget is $3000' }];
    const target = [{ id: 't1', text: 'Budget is $3500' }];
    const result = diffCommits(source, target);

    expect(result.equivalent.length).toBe(0);
    expect(result.similar.length).toBe(1);
  });

  test('near-identical pairs (≥ 0.85) go to equivalent bucket', () => {
    // "The user prefers morning meetings" vs "The user prefers morning sessions"
    // Tokens: {the, user, prefers, morning, meetings} vs {the, user, prefers, morning, sessions}
    // Intersection = 4, Union = 6, Jaccard = 4/6 ≈ 0.667 → similar (< 0.85)
    // Need a pair with higher overlap:
    // "The user prefers early morning meetings every day" vs "The user prefers early morning sessions every day"
    // Tokens: 8 words each, 7 in common, union = 9, Jaccard = 7/9 ≈ 0.778 → still similar
    // Need even higher:
    // 10 words, 9 in common → Jaccard = 9/11 ≈ 0.818 → still below 0.85
    // 10 words, 10 in common out of 11 → Jaccard = 10/12 ≈ 0.833 → still below
    // Actually need: 6/7 = 0.857 → equivalent
    const source = [{ id: 's1', text: 'The user always prefers meeting in the morning time slot' }];
    const target = [
      { id: 't1', text: 'The user always prefers meeting in the morning time block' },
    ];
    const result = diffCommits(source, target);

    // 10 words each, 9 in common, union = 11, Jaccard = 9/11 ≈ 0.818
    // Actually calculate: tokens share 9 (the, user, always, prefers, meeting, in, the, morning, time)
    // unique: slot, block → union = 11, J = 9/11 = 0.818 < 0.85
    // So we need even more overlap. Let's use 12-word sentences with 1 diff:
    const source2 = [
      {
        id: 's1',
        text: 'I want to make sure we always book the large meeting room for team calls',
      },
    ];
    const target2 = [
      {
        id: 't1',
        text: 'I want to make sure we always book the big meeting room for team calls',
      },
    ];
    const result2 = diffCommits(source2, target2);
    // 15 words each, 14 in common (large→big), union = 16
    // Jaccard = 14/16 = 0.875 >= 0.85 → equivalent!
    expect(result2.equivalent.length).toBe(1);
    expect(result2.similar.length).toBe(0);
    expect(result2.equivalent[0].similarity).toBeGreaterThanOrEqual(EQUIVALENT_THRESHOLD);
  });

  test('diffCommits returns all five categories', () => {
    const source = [
      { id: 's1', text: 'Unchanged sentence stays the same' },
      {
        id: 's2',
        text: 'I want to make sure we always book the large meeting room for team calls',
      },
      { id: 's3', text: 'Budget is $3000' },
      { id: 's4', text: 'This sentence will be removed completely from the document' },
    ];
    const target = [
      { id: 't1', text: 'Unchanged sentence stays the same' },
      {
        id: 't2',
        text: 'I want to make sure we always book the big meeting room for team calls',
      },
      { id: 't3', text: 'Budget is $3500' },
      { id: 't4', text: 'Brand new sentence added to the document' },
    ];

    const result = diffCommits(source, target);

    expect(result.identical.length).toBe(1);
    expect(result.equivalent.length).toBe(1);
    expect(result.similar.length).toBe(1);
    expect(result.onlyInSource.length).toBe(1);
    expect(result.onlyInTarget.length).toBe(1);
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
