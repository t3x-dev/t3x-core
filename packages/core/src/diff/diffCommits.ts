/**
 * Commit Diff Algorithm
 *
 * Hierarchical diff algorithm for comparing two commits at sentence level.
 * Uses a 4-stage pipeline with adaptive strategies:
 *
 * Stage 1: Exact Match    O(N+M)  → identical sentences, skip diff
 * Stage 2: Jaccard Matrix O(N×M)  → build sparse similarity matrix (threshold >= 0.4)
 * Stage 3: Matching        varies → Hungarian (≤200) or Greedy (>200)
 * Stage 4: LCS + Classify O(K×W²) → word diff for pairs, classify remainder
 *
 * Performance tiers:
 * - ≤200 sentences: Hungarian O(N³) — globally optimal matching
 * - >200 sentences: Greedy O(N×M) — fast approximate matching by descending similarity
 *
 * Why the split? Hungarian is O(N³) which becomes slow (>500ms) past 200 sentences.
 * Greedy matching by descending similarity gives near-optimal results in O(N×M).
 */

import { buildSimilarityMatrix, hungarian } from './hungarian';
import { JACCARD_THRESHOLD, jaccard } from './jaccard';
import { wordDiff } from './lcs';
import { tokenizeForMatching } from './tokenize';
import type { CommitDiff, DiffableSentence, SentencePair } from './types';

/** Threshold for switching from Hungarian to greedy matching */
const GREEDY_THRESHOLD = 200;

/**
 * Result of Stage 1: Exact text matching
 */
interface ExactMatchResult {
  /** Sentences with identical text in both */
  identical: DiffableSentence[];
  /** Source sentences not matched */
  unmatchedA: DiffableSentence[];
  /** Target sentences not matched */
  unmatchedB: DiffableSentence[];
}

interface TokenizedSentence {
  sentence: DiffableSentence;
  tokens: string[];
}

/**
 * Stage 1: Find sentences with identical text
 *
 * O(N+M) using hash sets for fast lookup.
 */
function findExactMatches(
  sentencesA: DiffableSentence[],
  sentencesB: DiffableSentence[]
): ExactMatchResult {
  const textsB = new Set(sentencesB.map((s) => s.text));
  const textsA = new Set(sentencesA.map((s) => s.text));

  const identical = sentencesA.filter((s) => textsB.has(s.text));
  const unmatchedA = sentencesA.filter((s) => !textsB.has(s.text));
  const unmatchedB = sentencesB.filter((s) => !textsA.has(s.text));

  return { identical, unmatchedA, unmatchedB };
}

/**
 * Greedy matching by descending similarity.
 *
 * For large sentence sets (>200), this is much faster than Hungarian.
 * Collects all above-threshold (i,j) pairs, sorts by similarity descending,
 * and greedily assigns each pair if neither index is already used.
 *
 * O(N×M) for matrix scan + O(K log K) for sorting candidates.
 */
function greedyMatch(
  tokenizedA: TokenizedSentence[],
  tokenizedB: TokenizedSentence[]
): Array<{ sourceIndex: number; targetIndex: number; similarity: number }> {
  // Collect all above-threshold candidates
  const candidates: Array<{ i: number; j: number; sim: number }> = [];

  for (let i = 0; i < tokenizedA.length; i++) {
    for (let j = 0; j < tokenizedB.length; j++) {
      const sim = jaccard(tokenizedA[i].tokens, tokenizedB[j].tokens);
      if (sim >= JACCARD_THRESHOLD) {
        candidates.push({ i, j, sim });
      }
    }
  }

  // Sort by similarity descending
  candidates.sort((a, b) => b.sim - a.sim);

  // Greedy assignment
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const pairs: Array<{ sourceIndex: number; targetIndex: number; similarity: number }> = [];

  for (const { i, j, sim } of candidates) {
    if (!usedA.has(i) && !usedB.has(j)) {
      pairs.push({ sourceIndex: i, targetIndex: j, similarity: sim });
      usedA.add(i);
      usedB.add(j);
    }
  }

  return pairs;
}

/**
 * Compare two commits and produce a structured diff.
 *
 * V4 Change: Accepts DiffableSentence[] (only id + text needed).
 * Upgrade #5: Adaptive matching (Hungarian for ≤200, Greedy for >200).
 *
 * @param source - Sentences from source commit (old/base version)
 * @param target - Sentences from target commit (new version)
 * @returns CommitDiff with identical, similar, onlyInSource, onlyInTarget arrays
 *
 * @example
 * const source = [{ id: 's1', text: 'Budget is $3000' }];
 * const target = [{ id: 't1', text: 'Budget is $3500' }];
 * const result = diffCommits(source, target);
 * // result.similar[0].similarity >= 0.4
 * // result.similar[0].wordDiff shows the $3000 → $3500 change
 */
export function diffCommits(source: DiffableSentence[], target: DiffableSentence[]): CommitDiff {
  // Stage 1: Exact match - find identical sentences
  const { identical, unmatchedA, unmatchedB } = findExactMatches(source, target);

  // Stage 2: Pre-tokenize all unmatched sentences
  const tokenizedA = unmatchedA.map((s) => ({ sentence: s, tokens: tokenizeForMatching(s.text) }));
  const tokenizedB = unmatchedB.map((s) => ({ sentence: s, tokens: tokenizeForMatching(s.text) }));

  // Stage 3: Matching — choose strategy based on input size
  const maxUnmatched = Math.max(tokenizedA.length, tokenizedB.length);
  let optimalPairs: Array<{ sourceIndex: number; targetIndex: number; similarity: number }>;

  if (maxUnmatched > GREEDY_THRESHOLD) {
    // Large input: use greedy matching O(N×M)
    optimalPairs = greedyMatch(tokenizedA, tokenizedB);
  } else {
    // Small input: use Hungarian O(N³) for globally optimal matching
    const matrix = buildSimilarityMatrix(tokenizedA, tokenizedB, (a, b) =>
      jaccard(a.tokens, b.tokens)
    );
    optimalPairs = hungarian(matrix);
  }

  // Process matched pairs
  const similar: SentencePair[] = [];
  const matchedSourceIds = new Set<string>();
  const matchedTargetIds = new Set<string>();

  for (const { sourceIndex, targetIndex, similarity } of optimalPairs) {
    if (similarity >= JACCARD_THRESHOLD) {
      const sentA = tokenizedA[sourceIndex].sentence;
      const sentB = tokenizedB[targetIndex].sentence;

      // Compute LCS word diff for matched pairs
      const diff = wordDiff(sentA.text, sentB.text);

      similar.push({
        source: sentA,
        target: sentB,
        similarity,
        wordDiff: diff,
      });

      matchedSourceIds.add(sentA.id);
      matchedTargetIds.add(sentB.id);
    }
  }

  // Stage 4: Classify remainder - unmatched sentences
  const onlyInSource = unmatchedA.filter((s) => !matchedSourceIds.has(s.id));
  const onlyInTarget = unmatchedB.filter((s) => !matchedTargetIds.has(s.id));

  return {
    identical,
    similar,
    onlyInSource,
    onlyInTarget,
  };
}
