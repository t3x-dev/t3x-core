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
 */

import { diffCommits } from '../diff';
import type { DiffableSentence } from '../diff/types';
import type { Merge2WayResult, MergeCandidate, MergeSimilarPair } from './types';

/**
 * Prepare a merge between two sentence arrays.
 * 准备两组句子的合并
 *
 * V4 Changes:
 * - Accepts DiffableSentence[] instead of CommitContent
 * - No constraint handling
 *
 * FROZEN - Do not modify without team agreement.
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
  // Run diff algorithm
  // 运行 diff 算法
  const diff = diffCommits(sourceSentences, targetSentences);

  // Map diff results to merge format
  // 将 diff 结果转换为 merge 格式

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
