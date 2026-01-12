/**
 * Commit Diff Algorithm
 *
 * Hierarchical diff algorithm for comparing two commits at sentence level.
 * Uses a 4-stage pipeline for efficiency:
 *
 * Stage 1: Exact Match O(N+M) → identical sentences, skip diff
 * Stage 2: Jaccard Filter (fast) → find candidate pairs with ≥30% word overlap
 * Stage 3: LCS Word Diff (expensive) → only for paired sentences
 * Stage 4: Classify remainder → unpaired = added/removed
 *
 * Why hierarchical? Comparing 50 sentences pairwise = O(N²) = 2500 comparisons.
 * By using cheap operations first (exact match, Jaccard), we filter down to
 * only truly similar sentence pairs for expensive LCS comparison.
 */

import type { Sentence } from '../types/commit';
import type { CommitDiff, SentencePair } from './types';
import { tokenize } from './tokenize';
import { jaccard, JACCARD_THRESHOLD } from './jaccard';
import { wordDiff } from './lcs';

/**
 * Result of Stage 1: Exact text matching
 */
interface ExactMatchResult {
  /** Sentences with identical text in both */
  identical: Sentence[];
  /** Source sentences not matched */
  unmatchedA: Sentence[];
  /** Target sentences not matched */
  unmatchedB: Sentence[];
}

/**
 * Stage 1: Find sentences with identical text
 *
 * O(N+M) using hash sets for fast lookup.
 */
function findExactMatches(sentencesA: Sentence[], sentencesB: Sentence[]): ExactMatchResult {
  const textsB = new Set(sentencesB.map((s) => s.text));
  const textsA = new Set(sentencesA.map((s) => s.text));

  const identical = sentencesA.filter((s) => textsB.has(s.text));
  const unmatchedA = sentencesA.filter((s) => !textsB.has(s.text));
  const unmatchedB = sentencesB.filter((s) => !textsA.has(s.text));

  return { identical, unmatchedA, unmatchedB };
}

/**
 * Compare two commits and produce a structured diff
 *
 * @param source - Sentences from source commit (old/base version)
 * @param target - Sentences from target commit (new version)
 * @returns CommitDiff with identical, similar, onlyInSource, onlyInTarget arrays
 *
 * @example
 * const source = [{ id: 's1', text: 'Budget is $3000', confidence: 1, source: { type: 'turn', id: 't1' } }];
 * const target = [{ id: 't1', text: 'Budget is $3500', confidence: 1, source: { type: 'turn', id: 't2' } }];
 * const result = diffCommits(source, target);
 * // result.similar[0].similarity >= 0.3
 * // result.similar[0].wordDiff shows the $3000 → $3500 change
 */
export function diffCommits(source: Sentence[], target: Sentence[]): CommitDiff {
  // Stage 1: Exact match - find identical sentences
  const { identical, unmatchedA, unmatchedB } = findExactMatches(source, target);

  // Stage 2 & 3: Jaccard filter + LCS word diff for similar pairs
  const similar: SentencePair[] = [];
  const matchedSourceIds = new Set<string>();
  const matchedTargetIds = new Set<string>();

  // Pre-tokenize all unmatched sentences for efficiency
  const tokenizedA = unmatchedA.map((s) => ({ sentence: s, tokens: tokenize(s.text) }));
  const tokenizedB = unmatchedB.map((s) => ({ sentence: s, tokens: tokenize(s.text) }));

  // Find best matching pairs using Jaccard similarity
  for (const { sentence: sentA, tokens: tokensA } of tokenizedA) {
    let bestMatch: { sentence: Sentence; similarity: number } | null = null;

    for (const { sentence: sentB, tokens: tokensB } of tokenizedB) {
      // Skip if already matched
      if (matchedTargetIds.has(sentB.id)) continue;

      const similarity = jaccard(tokensA, tokensB);

      // Stage 2: Jaccard filter - only consider pairs above threshold
      if (similarity >= JACCARD_THRESHOLD) {
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { sentence: sentB, similarity };
        }
      }
    }

    if (bestMatch) {
      // Stage 3: Compute expensive LCS word diff only for matched pairs
      const diff = wordDiff(sentA.text, bestMatch.sentence.text);

      similar.push({
        source: sentA,
        target: bestMatch.sentence,
        similarity: bestMatch.similarity,
        wordDiff: diff,
      });

      matchedSourceIds.add(sentA.id);
      matchedTargetIds.add(bestMatch.sentence.id);
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
