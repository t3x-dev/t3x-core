/**
 * Diff / Merge Performance Benchmarks (S14)
 *
 * Benchmarks for diffCommits and prepareMerge across different
 * sentence counts and overlap percentages.
 *
 * Run: vitest bench src/__tests__/benchmarks/diffPerformance.bench.ts
 */

import { bench, describe } from 'vitest';
import { diffCommits } from '../../diff/diffCommits';
import type { DiffableSentence } from '../../diff/types';
import { prepareMerge } from '../../merge/prepareMerge';

// ---------------------------------------------------------------------------
// Test data generators
// ---------------------------------------------------------------------------

function generateSentences(count: number, prefix: string): DiffableSentence[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}_${i}`,
    text: `This is sentence number ${i} about topic ${i % 10}. It discusses ${
      [
        'user preferences',
        'system requirements',
        'feature requests',
        'bug reports',
        'documentation',
      ][i % 5]
    } in detail with additional context about ${
      ['performance', 'security', 'usability', 'reliability', 'scalability'][i % 5]
    }.`,
  }));
}

/**
 * Generate a source/target pair with a controlled overlap percentage.
 *
 * - `overlapPercent` of the sentences are shared verbatim (identical).
 * - 30 % of the remaining budget becomes *similar* (slightly reworded).
 * - The rest are unique to each side.
 */
function generatePairWithOverlap(
  count: number,
  overlapPercent: number
): { source: DiffableSentence[]; target: DiffableSentence[] } {
  const overlapCount = Math.floor(count * overlapPercent);
  const uniqueCount = count - overlapCount;

  // Identical sentences (overlap)
  const shared: DiffableSentence[] = Array.from({ length: overlapCount }, (_, i) => ({
    id: `shared_${i}`,
    text: `Shared sentence ${i} about topic ${i % 10}. It covers ${['A', 'B', 'C', 'D', 'E'][i % 5]} with details.`,
  }));

  // Similar sentences (slightly modified wording)
  const similarCount = Math.floor(uniqueCount * 0.3);
  const sourceSimilar: DiffableSentence[] = Array.from({ length: similarCount }, (_, i) => ({
    id: `src_sim_${i}`,
    text: `The user wants feature ${i} for improving performance in area ${i % 5}.`,
  }));
  const targetSimilar: DiffableSentence[] = Array.from({ length: similarCount }, (_, i) => ({
    id: `tgt_sim_${i}`,
    text: `The user requires feature ${i} for enhancing performance in area ${i % 5}.`,
  }));

  // Unique sentences
  const sourceOnly = generateSentences(uniqueCount - similarCount, 'src_only');
  const targetOnly = generateSentences(uniqueCount - similarCount, 'tgt_only');

  return {
    source: [...shared, ...sourceSimilar, ...sourceOnly],
    target: [...shared, ...targetSimilar, ...targetOnly],
  };
}

// ---------------------------------------------------------------------------
// diffCommits benchmarks
// ---------------------------------------------------------------------------

describe('diffCommits performance', () => {
  // 50 sentences (small - fast Hungarian matching)
  const pair50 = generatePairWithOverlap(50, 0.5);
  bench('50 sentences (50% overlap)', () => {
    diffCommits(pair50.source, pair50.target);
  });

  // 200 sentences (boundary - still Hungarian)
  const pair200 = generatePairWithOverlap(200, 0.5);
  bench('200 sentences (50% overlap)', () => {
    diffCommits(pair200.source, pair200.target);
  });

  // 500 sentences (large - greedy matching)
  const pair500 = generatePairWithOverlap(500, 0.5);
  bench('500 sentences (50% overlap)', () => {
    diffCommits(pair500.source, pair500.target);
  });

  // 1000 sentences (stress test)
  const pair1000 = generatePairWithOverlap(1000, 0.5);
  bench('1000 sentences (50% overlap)', () => {
    diffCommits(pair1000.source, pair1000.target);
  });
});

// ---------------------------------------------------------------------------
// prepareMerge benchmarks
// ---------------------------------------------------------------------------

describe('prepareMerge performance', () => {
  const pair50 = generatePairWithOverlap(50, 0.5);
  bench('50 sentences', () => {
    prepareMerge(pair50.source, pair50.target);
  });

  const pair200 = generatePairWithOverlap(200, 0.5);
  bench('200 sentences', () => {
    prepareMerge(pair200.source, pair200.target);
  });

  const pair500 = generatePairWithOverlap(500, 0.5);
  bench('500 sentences', () => {
    prepareMerge(pair500.source, pair500.target);
  });
});

// ---------------------------------------------------------------------------
// diffCommits edge cases
// ---------------------------------------------------------------------------

describe('diffCommits edge cases', () => {
  // No overlap - worst case: every sentence must go through Jaccard + matching
  const noOverlap = generatePairWithOverlap(100, 0);
  bench('100 sentences, 0% overlap (worst case)', () => {
    diffCommits(noOverlap.source, noOverlap.target);
  });

  // Full overlap - best case: all sentences matched in Stage 1 (exact)
  const fullOverlap = generatePairWithOverlap(100, 1.0);
  bench('100 sentences, 100% overlap (best case)', () => {
    diffCommits(fullOverlap.source, fullOverlap.target);
  });
});
