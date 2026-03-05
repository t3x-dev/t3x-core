/**
 * diffCommits Tests
 *
 * Tests the 4-stage commit diff pipeline:
 * Stage 1: Exact match, Stage 2: Jaccard matrix,
 * Stage 3: Hungarian matching, Stage 4: LCS + classify remainder.
 */

import { describe, expect, it } from 'vitest';
import { diffCommits, diffCommitsWithEmbeddings } from '../../diff/diffCommits';
import type { DiffableSentence } from '../../diff/types';
import type { EmbeddingProvider } from '../../providers/embedding/base';

function sent(id: string, text: string): DiffableSentence {
  return { id, text };
}

/** Stub embedding provider that uses character overlap as a fake "embedding" */
class StubEmbedder implements EmbeddingProvider {
  readonly id = 'stub:test';
  readonly dim = 3;

  async encode(texts: string[]): Promise<number[][]> {
    // Simple 3-dim "embedding" based on text properties
    return texts.map((t) => {
      const words = t.toLowerCase().split(/\s+/);
      return [words.length, t.length / 100, words.filter((w) => w.length > 4).length];
    });
  }

  similarity(a: number[], b: number[]): number {
    // Cosine similarity
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  }
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

  // ===========================================================================
  // Large input performance
  // ===========================================================================
  describe('large input performance', () => {
    it('greedy path (250+250) completes in time', () => {
      // 250 per side → max=250 > GREEDY_THRESHOLD(200), uses greedy O(N×M)
      const source = Array.from({ length: 250 }, (_, i) =>
        sent(
          `src_${i}`,
          `Sentence about topic ${i % 20} with unique detail number ${i} and additional context`
        )
      );
      const target = Array.from({ length: 250 }, (_, i) =>
        sent(
          `tgt_${i}`,
          `Sentence about topic ${i % 20} with different content number ${i} and more context`
        )
      );

      const start = performance.now();
      const result = diffCommits(source, target);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5000);
      expect(
        result.similar.length + result.onlyInSource.length + result.onlyInTarget.length
      ).toBeGreaterThan(0);
    });

    it('bucketed path (501+501) finds correct similar pairs', () => {
      // 501 per side → max=501 > BUCKET_THRESHOLD(500), triggers bucketed greedy
      const source = Array.from({ length: 501 }, (_, i) =>
        sent(`src_${i}`, `Knowledge point ${i} about topic ${i % 15} with details`)
      );
      const target = Array.from({ length: 501 }, (_, i) =>
        sent(
          `tgt_${i}`,
          i < 20
            ? `Knowledge point ${i} about topic ${i % 15} with updated details`
            : `Completely new sentence number ${i} with fresh content here`
        )
      );

      const start = performance.now();
      const result = diffCommits(source, target);
      const elapsed = performance.now() - start;

      // Bucketed path should be fast even in full suite
      expect(elapsed).toBeLessThan(5000);

      // The first 20 targets share most words with corresponding sources
      // Bucketing should find at least some of these (same starting tokens)
      expect(result.similar.length).toBeGreaterThanOrEqual(10);

      // Total should account for all sentences
      const total =
        result.identical.length +
        result.similar.length * 2 +
        result.onlyInSource.length +
        result.onlyInTarget.length;
      expect(total).toBe(1002);
    });
  });

  // ===========================================================================
  // diffCommitsWithEmbeddings
  // ===========================================================================
  describe('diffCommitsWithEmbeddings', () => {
    it('falls back to Jaccard-only when no embedding provider', async () => {
      const source = [sent('s1', 'The cat sat on the mat'), sent('s2', 'Dogs like bones')];
      const target = [sent('t1', 'The cat sat on the mat'), sent('t2', 'Cats enjoy playing')];

      const result = await diffCommitsWithEmbeddings(source, target);
      // Should behave identically to sync diffCommits
      const syncResult = diffCommits(source, target);
      expect(result.identical.length).toBe(syncResult.identical.length);
      expect(result.similar.length).toBe(syncResult.similar.length);
      expect(result.onlyInSource.length).toBe(syncResult.onlyInSource.length);
      expect(result.onlyInTarget.length).toBe(syncResult.onlyInTarget.length);
    });

    it('returns valid diff result with embedding provider', async () => {
      const embedder = new StubEmbedder();
      const source = [
        sent('s1', 'The user prefers window seats'),
        sent('s2', 'Budget is around two thousand dollars'),
      ];
      const target = [
        sent('t1', 'The user wants window seats'),
        sent('t2', 'Budget is around two thousand dollars'),
      ];

      const result = await diffCommitsWithEmbeddings(source, target, embedder);

      // t2 is exact match
      expect(result.identical.length).toBe(1);
      expect(result.identical[0].text).toBe('Budget is around two thousand dollars');

      // s1/t1 should be matched as a similar pair (shared words: "the user window seats")
      expect(result.similar.length).toBe(1);

      // No leftover sentences
      expect(result.onlyInSource.length).toBe(0);
      expect(result.onlyInTarget.length).toBe(0);
    });

    it('preserves position metadata through embedding path', async () => {
      const embedder = new StubEmbedder();
      const source = [
        sent('s1', 'First sentence here'),
        sent('s2', 'Second sentence there'),
        sent('s3', 'Third unique sentence'),
      ];
      const target = [sent('t1', 'First sentence here'), sent('t2', 'Fourth new sentence')];

      const result = await diffCommitsWithEmbeddings(source, target, embedder);

      // Identical sentences should have position
      for (const s of result.identical) {
        expect(s.position).toBeDefined();
      }
    });
  });
});
