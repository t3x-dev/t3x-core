/**
 * Prepare Merge
 *
 * Prepares a merge between two sentence arrays for user decision-making.
 * Returns a structure ready for UI display.
 *
 * 准备合并 - 为用户决策准备两组句子的合并结构
 *
 * V4 Changes:
 * - Accepts DiffableSentence[] instead of CommitContent
 * - No constraint handling (constraints belong to Leaf)
 * - Optional embedding provider for improved similarity matching
 */

import { diffCommits, diffCommitsWithEmbeddings } from '../diff/diffCommits';
import type { CommitDiff, DiffableSentence } from '../diff/types';
import type { EmbeddingProvider } from '../providers/embedding/base';
import type { Merge2WayResult, MergeCandidate, MergeSimilarPair } from './types';

/**
 * Convert a CommitDiff to Merge2WayResult format.
 * 将 CommitDiff 转换为 Merge2WayResult 格式
 */
function diffToMergeResult(diff: CommitDiff): Merge2WayResult {
  // Similar pairs: user must choose source or target
  // 相似句子对：用户必须选择 source 或 target
  const similarPairs: MergeSimilarPair[] = diff.similar.map((pair) => ({
    source: pair.source,
    target: pair.target,
    wordDiff: pair.wordDiff,
    resolution: undefined, // User must decide
  }));

  // Only in source: user decides keep/discard
  // 仅在 source 中：用户决定保留或丢弃
  const onlyInSource: MergeCandidate[] = diff.onlyInSource.map((s) => ({
    sentence: s,
    keep: true, // Default to keep
  }));

  // Only in target: user decides keep/discard
  // 仅在 target 中：用户决定保留或丢弃
  const onlyInTarget: MergeCandidate[] = diff.onlyInTarget.map((s) => ({
    sentence: s,
    keep: true, // Default to keep
  }));

  return {
    identical: diff.identical,
    similarPairs,
    onlyInSource,
    onlyInTarget,
  };
}

/**
 * Prepare a merge between two sentence arrays.
 * 准备两组句子的合并
 *
 * V4 Changes:
 * - Accepts DiffableSentence[] instead of CommitContent
 * - No constraint handling
 *
 * Returns a structure ready for user decisions:
 * - identical: auto-kept, no action needed (自动保留)
 * - similarPairs: user must pick source or target (用户选择)
 * - onlyInSource/onlyInTarget: user can keep or discard (default: keep) (用户决定保留或丢弃)
 *
 * @example
 * const sourceSentences = [{ id: 's1', text: 'Budget is $3000' }];
 * const targetSentences = [{ id: 't1', text: 'Budget is $3500' }];
 *
 * prepareMerge(sourceSentences, targetSentences)
 * → {
 *     identical: [],
 *     similarPairs: [{
 *       source: { id: 's1', text: 'Budget is $3000' },
 *       target: { id: 't1', text: 'Budget is $3500' },
 *       wordDiff: [...],
 *       resolution: undefined,  // user must set
 *     }],
 *     onlyInSource: [],
 *     onlyInTarget: []
 *   }
 */
export function prepareMerge(
  sourceSentences: DiffableSentence[],
  targetSentences: DiffableSentence[]
): Merge2WayResult {
  // Run diff algorithm (synchronous, Jaccard-only)
  // 运行 diff 算法（同步，仅 Jaccard）
  const diff = diffCommits(sourceSentences, targetSentences);
  return diffToMergeResult(diff);
}

/**
 * Async version of prepareMerge with optional embedding provider.
 * 异步版本的 prepareMerge，支持可选的嵌入提供者
 *
 * When an embedding provider is given, uses a combined scoring strategy
 * (0.6 * Jaccard + 0.4 * cosine) for improved similarity matching.
 * Falls back to pure Jaccard when no provider is given.
 *
 * @param sourceSentences - Source sentences
 * @param targetSentences - Target sentences
 * @param embeddingProvider - Optional embedding provider for semantic matching
 * @returns Merge2WayResult ready for user decisions
 */
export async function prepareMergeWithEmbeddings(
  sourceSentences: DiffableSentence[],
  targetSentences: DiffableSentence[],
  embeddingProvider?: EmbeddingProvider
): Promise<Merge2WayResult> {
  if (!embeddingProvider) {
    // No embedder: use synchronous path
    return prepareMerge(sourceSentences, targetSentences);
  }

  // Run async diff with embedding-enhanced matching
  const diff = await diffCommitsWithEmbeddings(sourceSentences, targetSentences, embeddingProvider);
  return diffToMergeResult(diff);
}
