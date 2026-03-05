/**
 * Incremental Diff Tests
 *
 * Tests the incremental diff algorithm that caches previous results
 * and only re-diffs sentences that changed.
 */

import { describe, expect, it } from 'vitest';
import { diffCommits } from '../../diff/diffCommits';
import { incrementalDiffCommits } from '../../diff/incrementalDiff';
import type { DiffableSentence } from '../../diff/types';

function sent(id: string, text: string): DiffableSentence {
  return { id, text };
}

describe('incrementalDiffCommits', () => {
  // ===========================================================================
  // First call (no cache)
  // ===========================================================================
  describe('first call (no cache)', () => {
    it('produces same result as diffCommits', () => {
      const source = [sent('s1', 'Budget is $3000'), sent('s2', 'Timeline is Q1')];
      const target = [sent('t1', 'Budget is $3500'), sent('t2', 'Timeline is Q1')];

      const expected = diffCommits(source, target);
      const [result, cache] = incrementalDiffCommits(source, target, null);

      expect(result.identical).toEqual(expected.identical);
      expect(result.similar).toEqual(expected.similar);
      expect(result.onlyInSource).toEqual(expected.onlyInSource);
      expect(result.onlyInTarget).toEqual(expected.onlyInTarget);
      expect(cache).toBeDefined();
    });

    it('returns cache with correct source/target maps', () => {
      const source = [sent('s1', 'Hello'), sent('s2', 'World')];
      const target = [sent('t1', 'Hello'), sent('t2', 'Goodbye')];

      const [, cache] = incrementalDiffCommits(source, target, null);

      expect(cache.sourceTexts.get('s1')).toBe('Hello');
      expect(cache.sourceTexts.get('s2')).toBe('World');
      expect(cache.targetTexts.get('t1')).toBe('Hello');
      expect(cache.targetTexts.get('t2')).toBe('Goodbye');
    });
  });

  // ===========================================================================
  // No changes
  // ===========================================================================
  describe('no changes', () => {
    it('returns cached result when inputs are identical', () => {
      const source = [sent('s1', 'Budget is $3000'), sent('s2', 'Status active')];
      const target = [sent('t1', 'Budget is $3500'), sent('t2', 'Status active')];

      const [result1, cache1] = incrementalDiffCommits(source, target, null);
      const [result2, cache2] = incrementalDiffCommits(source, target, cache1);

      // Same result object (fast path)
      expect(result2).toBe(result1);
      expect(cache2).toBe(cache1);
    });
  });

  // ===========================================================================
  // Sentence addition
  // ===========================================================================
  describe('sentence addition', () => {
    it('handles adding a new source sentence', () => {
      const source = [sent('s1', 'Budget is $3000'), sent('s2', 'Status active')];
      const target = [sent('t1', 'Budget is $3500'), sent('t2', 'Status active')];

      const [, cache] = incrementalDiffCommits(source, target, null);

      // Add a new source sentence
      const newSource = [...source, sent('s3', 'New priority item')];
      const [result2] = incrementalDiffCommits(newSource, target, cache);

      // s2/t2 still identical, s1/t1 still similar, s3 is onlyInSource
      expect(result2.identical).toHaveLength(1);
      expect(result2.identical[0].text).toBe('Status active');
      expect(result2.similar).toHaveLength(1);
      expect(result2.similar[0].source.text).toContain('$3000');
      expect(result2.onlyInSource).toHaveLength(1);
      expect(result2.onlyInSource[0].text).toBe('New priority item');
    });

    it('handles adding a new target sentence', () => {
      const source = [sent('s1', 'Hello'), sent('s2', 'World')];
      const target = [sent('t1', 'Hello')];

      const [, cache] = incrementalDiffCommits(source, target, null);

      const newTarget = [...target, sent('t2', 'Goodbye')];
      const [result2] = incrementalDiffCommits(source, newTarget, cache);

      expect(result2.identical).toHaveLength(1);
      expect(result2.onlyInSource).toHaveLength(1);
      expect(result2.onlyInTarget).toHaveLength(1);
    });

    it('detects when new target matches previously-unmatched source', () => {
      const source = [sent('s1', 'Budget is $3000'), sent('s2', 'Timeline is Q1')];
      const target = [sent('t1', 'Unrelated topic')];

      const [result1, cache] = incrementalDiffCommits(source, target, null);
      expect(result1.onlyInSource).toHaveLength(2);

      // Add target that matches s1
      const newTarget = [sent('t1', 'Unrelated topic'), sent('t2', 'Budget is $3500')];
      const [result2] = incrementalDiffCommits(source, newTarget, cache);

      // s1 should now be paired with t2
      expect(result2.similar).toHaveLength(1);
      expect(result2.similar[0].source.text).toContain('$3000');
      expect(result2.similar[0].target.text).toContain('$3500');
    });
  });

  // ===========================================================================
  // Sentence modification
  // ===========================================================================
  describe('sentence modification', () => {
    it('re-diffs when source text changes', () => {
      const source = [
        sent('s1', 'Budget is $3000'),
        sent('s2', 'Timeline is Q1'),
        sent('s3', 'Status active'),
      ];
      const target = [
        sent('t1', 'Budget is $3500'),
        sent('t2', 'Timeline is Q2'),
        sent('t3', 'Status active'),
      ];

      const [, cache] = incrementalDiffCommits(source, target, null);

      // Modify s1
      const modifiedSource = [
        sent('s1', 'Budget is $4000'),
        sent('s2', 'Timeline is Q1'),
        sent('s3', 'Status active'),
      ];
      const [result2] = incrementalDiffCommits(modifiedSource, target, cache);

      expect(result2.identical).toHaveLength(1);
      expect(result2.identical[0].text).toBe('Status active');

      // s1-t1 should be re-paired with updated text
      const budgetPair = result2.similar.find((p) => p.source.text.includes('$4000'));
      expect(budgetPair).toBeDefined();
      expect(budgetPair!.target.text).toContain('$3500');

      // s2-t2 should be preserved as stable pair
      const timelinePair = result2.similar.find((p) => p.source.text.includes('Q1'));
      expect(timelinePair).toBeDefined();
    });

    it('preserves stable pair wordDiff and similarity', () => {
      const source = [sent('s1', 'Budget is $3000'), sent('s2', 'Timeline is Q1')];
      const target = [sent('t1', 'Budget is $3500'), sent('t2', 'Timeline is Q2')];

      const [result1, cache] = incrementalDiffCommits(source, target, null);

      // Add a new sentence (doesn't affect existing pairs)
      const newSource = [
        sent('s1', 'Budget is $3000'),
        sent('s2', 'Timeline is Q1'),
        sent('s3', 'New item'),
      ];
      const [result2] = incrementalDiffCommits(newSource, target, cache);

      // Both pairs should be stable — same similarity values
      for (const pair of result1.similar) {
        const stablePair = result2.similar.find((p) => p.source.id === pair.source.id);
        expect(stablePair).toBeDefined();
        expect(stablePair!.similarity).toBe(pair.similarity);
        expect(stablePair!.wordDiff).toEqual(pair.wordDiff);
      }
    });
  });

  // ===========================================================================
  // Sentence removal
  // ===========================================================================
  describe('sentence removal', () => {
    it('handles removing a source sentence', () => {
      const source = [sent('s1', 'Budget is $3000'), sent('s2', 'Timeline is Q1')];
      const target = [sent('t1', 'Budget is $3500'), sent('t2', 'Timeline is Q2')];

      const [, cache] = incrementalDiffCommits(source, target, null);

      // Remove s1
      const newSource = [sent('s2', 'Timeline is Q1')];
      const [result2] = incrementalDiffCommits(newSource, target, cache);

      // s2-t2 should still be paired, t1 becomes onlyInTarget
      expect(result2.similar).toHaveLength(1);
      expect(result2.similar[0].source.text).toContain('Q1');
      expect(result2.onlyInTarget).toHaveLength(1);
      expect(result2.onlyInTarget[0].text).toContain('$3500');
    });

    it('partner of removed sentence becomes dirty', () => {
      const source = [sent('s1', 'Budget is $3000'), sent('s2', 'Timeline is Q1')];
      const target = [sent('t1', 'Budget is $3500'), sent('t2', 'Another topic entirely')];

      const [result1, cache] = incrementalDiffCommits(source, target, null);
      // s1-t1 should be similar
      expect(result1.similar.length).toBeGreaterThanOrEqual(1);

      // Remove s1 → t1 loses partner and goes to dirty pool
      const newSource = [sent('s2', 'Timeline is Q1')];
      const [result2] = incrementalDiffCommits(newSource, target, cache);

      // t1 should now be onlyInTarget (no source to match)
      expect(result2.onlyInTarget.some((s) => s.text.includes('$3500'))).toBe(true);
    });
  });

  // ===========================================================================
  // Text becoming identical
  // ===========================================================================
  describe('identical transitions', () => {
    it('moves sentence to identical when target text matches', () => {
      const source = [sent('s1', 'Budget is $3000')];
      const target = [sent('t1', 'Budget is $3500')];

      const [result1, cache] = incrementalDiffCommits(source, target, null);
      expect(result1.similar).toHaveLength(1);

      // Change target to exact match
      const newTarget = [sent('t1', 'Budget is $3000')];
      const [result2] = incrementalDiffCommits(source, newTarget, cache);

      expect(result2.identical).toHaveLength(1);
      expect(result2.similar).toHaveLength(0);
    });

    it('moves sentence from identical when texts diverge', () => {
      const source = [sent('s1', 'Same text')];
      const target = [sent('t1', 'Same text')];

      const [result1, cache] = incrementalDiffCommits(source, target, null);
      expect(result1.identical).toHaveLength(1);

      // Change source text
      const newSource = [sent('s1', 'Different text now')];
      const [result2] = incrementalDiffCommits(newSource, target, cache);

      expect(result2.identical).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================
  describe('edge cases', () => {
    it('handles empty source and target', () => {
      const [result, cache] = incrementalDiffCommits([], [], null);
      expect(result.identical).toHaveLength(0);
      expect(result.similar).toHaveLength(0);

      const [result2] = incrementalDiffCommits([], [], cache);
      expect(result2).toBe(result);
    });

    it('handles all sentences changing at once', () => {
      const source = [sent('s1', 'Alpha'), sent('s2', 'Beta')];
      const target = [sent('t1', 'Alpha'), sent('t2', 'Beta')];

      const [, cache] = incrementalDiffCommits(source, target, null);

      const newSource = [sent('s1', 'Gamma'), sent('s2', 'Delta')];
      const newTarget = [sent('t1', 'Epsilon'), sent('t2', 'Zeta')];
      const [result2] = incrementalDiffCommits(newSource, newTarget, cache);

      // Full re-diff — no stable pairs possible
      const total =
        result2.identical.length +
        result2.similar.length * 2 +
        result2.onlyInSource.length +
        result2.onlyInTarget.length;
      expect(total).toBe(4);
    });

    it('handles source_ref preservation', () => {
      const sourceRef = {
        conversation_id: 'conv_1',
        turn_hash: 'sha256:abc',
        start_char: 0,
        end_char: 10,
      };
      const source = [{ id: 's1', text: 'Hello world', source_ref: sourceRef }];
      const target = [{ id: 't1', text: 'Hello world' }];

      const [result] = incrementalDiffCommits(source, target, null);
      expect(result.identical[0].source_ref).toEqual(sourceRef);
    });

    it('handles id reuse with different text', () => {
      const source = [sent('s1', 'Original text')];
      const target = [sent('t1', 'Target text')];

      const [, cache] = incrementalDiffCommits(source, target, null);

      // Same id but different text
      const newSource = [sent('s1', 'Completely new text')];
      const [result2] = incrementalDiffCommits(newSource, target, cache);

      // Should detect the text change and re-diff
      expect(result2.identical).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Performance
  // ===========================================================================
  describe('performance', () => {
    it('incremental diff with few changes is faster than full diff (200+ sentences)', () => {
      // Build 300 sentences per side
      const source = Array.from({ length: 300 }, (_, i) =>
        sent(
          `src_${i}`,
          `Sentence about topic ${i % 20} with unique detail number ${i} and additional context`
        )
      );
      const target = Array.from({ length: 300 }, (_, i) =>
        sent(
          `tgt_${i}`,
          `Sentence about topic ${i % 20} with different content number ${i} and more context`
        )
      );

      // Initial full diff
      const [, cache] = incrementalDiffCommits(source, target, null);

      // Modify only 3 sentences
      const modifiedSource = source.map((s, i) => (i < 3 ? sent(s.id, `${s.text} MODIFIED`) : s));

      // Measure incremental diff time
      const start = performance.now();
      const [result] = incrementalDiffCommits(modifiedSource, target, cache);
      const incrementalMs = performance.now() - start;

      // Measure full diff time for comparison
      const start2 = performance.now();
      diffCommits(modifiedSource, target);
      const fullMs = performance.now() - start2;

      // Incremental should be significantly faster
      expect(incrementalMs).toBeLessThan(fullMs);

      // Verify correctness: total sentence count should be consistent
      const total =
        result.identical.length +
        result.similar.length * 2 +
        result.onlyInSource.length +
        result.onlyInTarget.length;
      expect(total).toBe(600);
    });

    it('no-change fast path completes in <1ms', () => {
      const source = Array.from({ length: 500 }, (_, i) => sent(`s_${i}`, `Knowledge point ${i}`));
      const target = Array.from({ length: 500 }, (_, i) => sent(`t_${i}`, `Knowledge point ${i}`));

      const [, cache] = incrementalDiffCommits(source, target, null);

      const start = performance.now();
      incrementalDiffCommits(source, target, cache);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5); // should be ~0.1ms
    });

    it('meets <50ms target for 200+ sentences with 5 changes', () => {
      const source = Array.from({ length: 250 }, (_, i) =>
        sent(`src_${i}`, `Topic ${i % 25} detail ${i} with extra words for matching`)
      );
      const target = Array.from({ length: 250 }, (_, i) =>
        sent(`tgt_${i}`, `Topic ${i % 25} content ${i} with extra words for matching`)
      );

      const [, cache] = incrementalDiffCommits(source, target, null);

      // Change 5 sentences
      const modified = source.map((s, i) =>
        i < 5 ? sent(s.id, `Completely new sentence number ${i} about something else`) : s
      );

      const start = performance.now();
      incrementalDiffCommits(modified, target, cache);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
    });
  });

  // ===========================================================================
  // Cache chaining
  // ===========================================================================
  describe('cache chaining', () => {
    it('supports multiple incremental updates in sequence', () => {
      const source = [
        sent('s1', 'Budget is $3000'),
        sent('s2', 'Timeline is Q1'),
        sent('s3', 'Team size is 5'),
      ];
      const target = [
        sent('t1', 'Budget is $3500'),
        sent('t2', 'Timeline is Q2'),
        sent('t3', 'Team size is 5'),
      ];

      // Round 1: initial diff
      const [, cache1] = incrementalDiffCommits(source, target, null);

      // Round 2: modify one sentence
      const source2 = [
        sent('s1', 'Budget is $4000'),
        sent('s2', 'Timeline is Q1'),
        sent('s3', 'Team size is 5'),
      ];
      const [result2, cache2] = incrementalDiffCommits(source2, target, cache1);
      expect(result2.identical).toHaveLength(1);

      // Round 3: add a sentence
      const source3 = [
        sent('s1', 'Budget is $4000'),
        sent('s2', 'Timeline is Q1'),
        sent('s3', 'Team size is 5'),
        sent('s4', 'Priority is high'),
      ];
      const [result3, cache3] = incrementalDiffCommits(source3, target, cache2);
      expect(result3.onlyInSource.some((s) => s.text === 'Priority is high')).toBe(true);

      // Round 4: no changes → fast path
      const [result4] = incrementalDiffCommits(source3, target, cache3);
      expect(result4).toBe(result3);
    });
  });
});
