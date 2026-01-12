/**
 * Word-level Diff Tests (Issue #70)
 *
 * Tests for tokenize, jaccard, lcs, wordDiff, and diffCommits functions.
 */

import { describe, expect, it } from 'vitest';
import {
  diffCommits,
  jaccard,
  JACCARD_THRESHOLD,
  lcs,
  tokenize,
  wordDiff,
} from '../../diff';
import type { Sentence } from '../../types';

// Helper to create test sentences
function createSentence(id: string, text: string): Sentence {
  return {
    id,
    text,
    confidence: 1,
    source: { type: 'test', id: `turn-${id}` },
  };
}

describe('tokenize', () => {
  it('splits on whitespace', () => {
    expect(tokenize('hello world')).toEqual(['hello', 'world']);
  });

  it('lowercases', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world']);
  });

  it('preserves punctuation on words', () => {
    expect(tokenize('Hello, World!')).toEqual(['hello,', 'world!']);
  });

  it('preserves special characters like $', () => {
    expect(tokenize('Budget is $3000')).toEqual(['budget', 'is', '$3000']);
  });

  it('handles multiple spaces', () => {
    expect(tokenize('hello   world')).toEqual(['hello', 'world']);
  });

  it('handles empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('handles whitespace only', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('jaccard', () => {
  it('identical arrays return 1', () => {
    expect(jaccard(['a', 'b'], ['a', 'b'])).toBe(1);
  });

  it('completely different returns 0', () => {
    expect(jaccard(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('partial overlap', () => {
    // intersection: ['b', 'c'] = 2
    // union: ['a', 'b', 'c', 'd'] = 4
    // 2/4 = 0.5
    expect(jaccard(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(0.5);
  });

  it('empty arrays return 0', () => {
    expect(jaccard([], [])).toBe(0);
  });

  it('one empty array returns 0', () => {
    expect(jaccard(['a', 'b'], [])).toBe(0);
    expect(jaccard([], ['a', 'b'])).toBe(0);
  });

  it('handles duplicates correctly (set-based)', () => {
    // Sets: {a, b} and {a, b}
    // intersection: 2, union: 2 → 1
    expect(jaccard(['a', 'a', 'b'], ['a', 'b', 'b'])).toBe(1);
  });
});

describe('lcs', () => {
  it('finds common subsequence', () => {
    expect(lcs(['the', 'quick', 'brown', 'fox'], ['the', 'slow', 'brown', 'dog'])).toEqual([
      'the',
      'brown',
    ]);
  });

  it('returns full array when identical', () => {
    expect(lcs(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns empty for completely different', () => {
    expect(lcs(['a', 'b'], ['c', 'd'])).toEqual([]);
  });

  it('handles empty arrays', () => {
    expect(lcs([], [])).toEqual([]);
    expect(lcs(['a'], [])).toEqual([]);
    expect(lcs([], ['a'])).toEqual([]);
  });

  it('finds longest subsequence', () => {
    expect(lcs(['a', 'b', 'c', 'd'], ['a', 'c', 'd'])).toEqual(['a', 'c', 'd']);
  });
});

describe('wordDiff', () => {
  it('single word change', () => {
    const result = wordDiff('Budget is $3000', 'Budget is $3500');
    expect(result).toEqual([
      { type: 'unchanged', text: 'budget' },
      { type: 'unchanged', text: 'is' },
      { type: 'removed', text: '$3000' },
      { type: 'added', text: '$3500' },
    ]);
  });

  it('identical strings', () => {
    const result = wordDiff('hello world', 'hello world');
    expect(result).toEqual([
      { type: 'unchanged', text: 'hello' },
      { type: 'unchanged', text: 'world' },
    ]);
  });

  it('completely different strings', () => {
    const result = wordDiff('hello world', 'foo bar');
    expect(result).toEqual([
      { type: 'removed', text: 'hello world' },
      { type: 'added', text: 'foo bar' },
    ]);
  });

  it('handles additions at end', () => {
    const result = wordDiff('hello', 'hello world');
    expect(result).toEqual([
      { type: 'unchanged', text: 'hello' },
      { type: 'added', text: 'world' },
    ]);
  });

  it('handles removals at end', () => {
    const result = wordDiff('hello world', 'hello');
    expect(result).toEqual([
      { type: 'unchanged', text: 'hello' },
      { type: 'removed', text: 'world' },
    ]);
  });

  it('handles additions at start', () => {
    const result = wordDiff('world', 'hello world');
    expect(result).toEqual([
      { type: 'added', text: 'hello' },
      { type: 'unchanged', text: 'world' },
    ]);
  });

  it('handles empty strings', () => {
    expect(wordDiff('', '')).toEqual([]);
    expect(wordDiff('hello', '')).toEqual([{ type: 'removed', text: 'hello' }]);
    expect(wordDiff('', 'hello')).toEqual([{ type: 'added', text: 'hello' }]);
  });
});

describe('diffCommits', () => {
  it('identical sentences go to identical[]', () => {
    const source = [createSentence('s1', 'Same text')];
    const target = [createSentence('t1', 'Same text')];
    const result = diffCommits(source, target);

    expect(result.identical).toHaveLength(1);
    expect(result.similar).toHaveLength(0);
    expect(result.onlyInSource).toHaveLength(0);
    expect(result.onlyInTarget).toHaveLength(0);
  });

  it('similar sentences are paired', () => {
    const source = [createSentence('s1', 'Budget is $3000')];
    const target = [createSentence('t1', 'Budget is $3500')];
    const result = diffCommits(source, target);

    expect(result.identical).toHaveLength(0);
    expect(result.similar).toHaveLength(1);
    expect(result.similar[0].similarity).toBeGreaterThanOrEqual(JACCARD_THRESHOLD);
    expect(result.similar[0].wordDiff.length).toBeGreaterThan(0);
  });

  it('unique sentences go to onlyIn arrays', () => {
    const source = [createSentence('s1', 'Only in source')];
    const target = [createSentence('t1', 'Completely different text here')];
    const result = diffCommits(source, target);

    expect(result.identical).toHaveLength(0);
    expect(result.similar).toHaveLength(0);
    expect(result.onlyInSource).toHaveLength(1);
    expect(result.onlyInTarget).toHaveLength(1);
  });

  it('handles empty arrays', () => {
    const result = diffCommits([], []);
    expect(result.identical).toHaveLength(0);
    expect(result.similar).toHaveLength(0);
    expect(result.onlyInSource).toHaveLength(0);
    expect(result.onlyInTarget).toHaveLength(0);
  });

  it('handles source-only', () => {
    const source = [createSentence('s1', 'Source only')];
    const result = diffCommits(source, []);

    expect(result.onlyInSource).toHaveLength(1);
    expect(result.onlyInTarget).toHaveLength(0);
  });

  it('handles target-only', () => {
    const target = [createSentence('t1', 'Target only')];
    const result = diffCommits([], target);

    expect(result.onlyInSource).toHaveLength(0);
    expect(result.onlyInTarget).toHaveLength(1);
  });

  it('complex scenario with mixed results', () => {
    const source = [
      createSentence('s1', 'Identical sentence here'),
      createSentence('s2', 'Budget is $3000 for project'),
      createSentence('s3', 'Apple banana cherry date'),
    ];
    const target = [
      createSentence('t1', 'Identical sentence here'),
      createSentence('t2', 'Budget is $5000 for project'),
      createSentence('t3', 'Xylophone zebra quantum physics'),
    ];
    const result = diffCommits(source, target);

    expect(result.identical).toHaveLength(1);
    expect(result.identical[0].text).toBe('Identical sentence here');

    expect(result.similar).toHaveLength(1);
    expect(result.similar[0].source.text).toBe('Budget is $3000 for project');
    expect(result.similar[0].target.text).toBe('Budget is $5000 for project');

    expect(result.onlyInSource).toHaveLength(1);
    expect(result.onlyInSource[0].text).toBe('Apple banana cherry date');

    expect(result.onlyInTarget).toHaveLength(1);
    expect(result.onlyInTarget[0].text).toBe('Xylophone zebra quantum physics');
  });

  it('pairs similar sentences correctly with word diff', () => {
    const source = [createSentence('s1', 'The quick brown fox')];
    const target = [createSentence('t1', 'The slow brown dog')];
    const result = diffCommits(source, target);

    expect(result.similar).toHaveLength(1);
    const pair = result.similar[0];

    // Check that word diff identifies the changes
    const removed = pair.wordDiff.filter((d) => d.type === 'removed');
    const added = pair.wordDiff.filter((d) => d.type === 'added');
    const unchanged = pair.wordDiff.filter((d) => d.type === 'unchanged');

    expect(removed.length).toBeGreaterThan(0);
    expect(added.length).toBeGreaterThan(0);
    expect(unchanged.length).toBeGreaterThan(0);
  });
});

describe('Performance', () => {
  it('50 sentences diff completes within 20ms', () => {
    const source: Sentence[] = [];
    const target: Sentence[] = [];

    for (let i = 0; i < 50; i++) {
      source.push(createSentence(`s${i}`, `This is source sentence number ${i} with some content`));
      target.push(createSentence(`t${i}`, `This is target sentence number ${i} with other content`));
    }

    const start = performance.now();
    diffCommits(source, target);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(20);
  });
});
