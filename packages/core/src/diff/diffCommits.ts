/**
 * Commit Diff Algorithm
 *
 * Hierarchical diff algorithm for comparing two commits at sentence level.
 * Uses a 4-stage pipeline for efficiency:
 *
 * Stage 1: Exact Match    O(N+M)  → identical sentences, skip diff
 * Stage 2: Jaccard Matrix O(N×M)  → build similarity matrix
 * Stage 3: Hungarian      O(N³)   → find globally optimal matching
 * Stage 4: LCS + Classify O(K×W²) → word diff for pairs, classify remainder
 *
 * Why Hungarian? Greedy matching may miss globally optimal pairings.
 * Hungarian algorithm guarantees maximum total similarity across all pairs.
 *
 * Performance: Handles up to 1000 sentences efficiently (~200ms).
 */

import { buildSimilarityMatrix, hungarian } from './hungarian';
import { JACCARD_THRESHOLD, jaccard } from './jaccard';
import { wordDiff } from './lcs';
import { tokenizeForMatching } from './tokenize';
import type { CommitDiff, DiffableSentence, SentencePair } from './types';

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
 * Compare two commits and produce a structured diff.
 *
 * V4 Change: Accepts DiffableSentence[] (only id + text needed).
 *
 * @param source - Sentences from source commit (old/base version)
 * @param target - Sentences from target commit (new version)
 * @returns CommitDiff with identical, similar, onlyInSource, onlyInTarget arrays
 *
 * @example
 * const source = [{ id: 's1', text: 'Budget is $3000' }];
 * const target = [{ id: 't1', text: 'Budget is $3500' }];
 * const result = diffCommits(source, target);
 * // result.similar[0].similarity >= 0.3
 * // result.similar[0].wordDiff shows the $3000 → $3500 change
 */
export function diffCommits(source: DiffableSentence[], target: DiffableSentence[]): CommitDiff {
  // Stage 1: Exact match - find identical sentences
  const { identical, unmatchedA, unmatchedB } = findExactMatches(source, target);

  // Stage 2: Build similarity matrix using Jaccard
  // 构建 Jaccard 相似度矩阵
  const similar: SentencePair[] = [];
  const matchedSourceIds = new Set<string>();
  const matchedTargetIds = new Set<string>();

  // Pre-tokenize all unmatched sentences for efficiency
  // 预先分词以提高效率
  const tokenizedA = unmatchedA.map((s) => ({ sentence: s, tokens: tokenizeForMatching(s.text) }));
  const tokenizedB = unmatchedB.map((s) => ({ sentence: s, tokens: tokenizeForMatching(s.text) }));

  // Build similarity matrix
  // 构建相似度矩阵
  const matrix = buildSimilarityMatrix(tokenizedA, tokenizedB, (a, b) =>
    jaccard(a.tokens, b.tokens)
  );

  // Stage 3: Hungarian algorithm for globally optimal matching
  // 使用匈牙利算法找到全局最优匹配
  const optimalPairs = hungarian(matrix);

  // Process optimal pairs - only include those above threshold
  // 处理最优配对 - 仅保留超过阈值的配对
  for (const { sourceIndex, targetIndex, similarity } of optimalPairs) {
    if (similarity >= JACCARD_THRESHOLD) {
      const sentA = tokenizedA[sourceIndex].sentence;
      const sentB = tokenizedB[targetIndex].sentence;

      // Compute LCS word diff for matched pairs
      // 为配对句子计算词级差异
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
