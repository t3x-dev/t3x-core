/**
 * Commit Diff Algorithm
 *
 * Hierarchical diff algorithm for comparing two commits at sentence level.
 * Uses a 4-stage pipeline with adaptive strategies:
 *
 * Stage 1: Exact Match    O(N+M)  → identical sentences, skip diff
 * Stage 2: Jaccard Matrix O(N×M)  → build sparse similarity matrix (threshold >= 0.4)
 * Stage 3: Matching        varies → Hungarian (≤200) or Greedy (>200) or Bucketed (>500)
 * Stage 4: LCS + Classify O(K×W²) → word diff for pairs, classify remainder
 *
 * Performance tiers:
 * - ≤200 sentences: Hungarian O(N³) — globally optimal matching
 * - 201-500 sentences: Greedy O(N×M) — fast approximate matching by descending similarity
 * - >500 sentences: Bucketed Greedy — topic-based bucketing reduces comparison space
 *
 * Why the split? Hungarian is O(N³) which becomes slow (>500ms) past 200 sentences.
 * Greedy matching by descending similarity gives near-optimal results in O(N×M).
 * For >500 sentences, bucketing by top content words avoids the full N×M scan.
 */

import { buildSimilarityMatrix, hungarian } from './hungarian';
import { JACCARD_THRESHOLD, jaccard } from './jaccard';
import { wordDiff } from './lcs';
import { tokenizeForMatching } from './tokenize';
import type { CommitDiff, DiffableSentence, SentencePair } from './types';

/** Threshold for switching from Hungarian to greedy matching */
const GREEDY_THRESHOLD = 200;

/** Threshold for switching from full greedy to bucketed greedy matching */
const BUCKET_THRESHOLD = 500;

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
 * Group sentences into buckets by their top content words.
 *
 * Uses the first 3 tokens as a bucket key, reducing comparison space from
 * O(N×M) to O(sum of bucket_i × bucket_j) for matching buckets only.
 *
 * Trade-off: sentences with different first 3 tokens are placed in separate
 * buckets and never compared, so some valid similar pairs may be missed.
 * This is acceptable for the >500 degradation tier where performance matters
 * more than perfect recall.
 */
function bucketByTopicWords(sentences: TokenizedSentence[]): Map<string, number[]> {
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < sentences.length; i++) {
    const key = sentences[i].tokens.slice(0, 3).join('_') || '_default';
    const bucket = buckets.get(key) ?? [];
    bucket.push(i);
    buckets.set(key, bucket);
  }
  return buckets;
}

/**
 * Bucketed greedy matching for large sentence sets (>500).
 *
 * Groups sentences by topic words and only compares within matching buckets,
 * dramatically reducing the number of Jaccard calls compared to full N×M scan.
 *
 * Same greedy assignment logic as the unbucketed version: sort candidates by
 * similarity descending, assign each pair if neither index is already used.
 */
function bucketedGreedyMatch(
  tokenizedA: TokenizedSentence[],
  tokenizedB: TokenizedSentence[]
): Array<{ sourceIndex: number; targetIndex: number; similarity: number }> {
  const bucketsA = bucketByTopicWords(tokenizedA);
  const bucketsB = bucketByTopicWords(tokenizedB);

  // Collect candidates: compare within matching buckets
  const candidates: Array<{ i: number; j: number; sim: number }> = [];
  const allKeys = new Set([...bucketsA.keys(), ...bucketsB.keys()]);

  for (const key of allKeys) {
    const indicesA = bucketsA.get(key) ?? [];
    const indicesB = bucketsB.get(key) ?? [];
    if (indicesA.length === 0 || indicesB.length === 0) continue;

    for (const i of indicesA) {
      for (const j of indicesB) {
        const sim = jaccard(tokenizedA[i].tokens, tokenizedB[j].tokens);
        if (sim >= JACCARD_THRESHOLD) {
          candidates.push({ i, j, sim });
        }
      }
    }
  }

  // Greedy assignment (same as original)
  candidates.sort((a, b) => b.sim - a.sim);
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
 * Greedy matching by descending similarity.
 *
 * For large sentence sets (>200), this is much faster than Hungarian.
 * Collects all above-threshold (i,j) pairs, sorts by similarity descending,
 * and greedily assigns each pair if neither index is already used.
 *
 * For >500 sentences, delegates to bucketedGreedyMatch for further speedup.
 *
 * O(N×M) for matrix scan + O(K log K) for sorting candidates.
 */
function greedyMatch(
  tokenizedA: TokenizedSentence[],
  tokenizedB: TokenizedSentence[]
): Array<{ sourceIndex: number; targetIndex: number; similarity: number }> {
  const total = Math.max(tokenizedA.length, tokenizedB.length);

  if (total > BUCKET_THRESHOLD) {
    return bucketedGreedyMatch(tokenizedA, tokenizedB);
  }

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
