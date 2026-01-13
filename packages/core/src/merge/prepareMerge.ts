/**
 * Prepare Merge
 *
 * Prepares a merge between two commits for user decision-making.
 * Returns a structure ready for UI display.
 *
 * 准备合并 - 为用户决策准备两个 commit 的合并结构
 */

import type { CommitContent, Constraint, Sentence } from '../types/commit';
import { diffCommits } from '../diff';
import type { Merge2WayResult, MergeCandidate, MergeSimilarPair } from './types';

/**
 * Group constraints by their source_sentence_id
 * 按 source_sentence_id 分组约束
 *
 * @example
 * constraints = [
 *   { id: 'c1', source_sentence_id: 's1', ... },
 *   { id: 'c2', source_sentence_id: 's1', ... },
 *   { id: 'c3', source_sentence_id: 's2', ... }
 * ]
 * → Map { 's1' => [c1, c2], 's2' => [c3] }
 */
export function groupConstraintsBySentence(
  constraints: Constraint[],
  sentences: Sentence[]
): Map<string, Constraint[]> {
  const map = new Map<string, Constraint[]>();

  // Initialize all sentence IDs with empty arrays
  // 为所有句子ID初始化空数组
  for (const s of sentences) {
    map.set(s.id, []);
  }

  // Assign constraints to their sentences
  // 将约束分配到对应的句子
  for (const c of constraints) {
    if (c.source_sentence_id && map.has(c.source_sentence_id)) {
      map.get(c.source_sentence_id)!.push(c);
    }
  }

  return map;
}

/**
 * Prepare a merge between two commits
 * 准备两个 commit 的合并
 *
 * Returns a structure ready for user decisions:
 * - identical: auto-kept, no action needed
 * - similarPairs: user must pick source or target
 * - onlyInSource/onlyInTarget: user can keep or discard (default: keep)
 *
 * @example
 * const source = {
 *   sentences: [{ id: 's1', text: 'Budget is $3000', ... }],
 *   constraints: [{ id: 'c1', value: '$3000', source_sentence_id: 's1', ... }]
 * };
 * const target = {
 *   sentences: [{ id: 't1', text: 'Budget is $3500', ... }],
 *   constraints: [{ id: 'c2', value: '$3500', source_sentence_id: 't1', ... }]
 * };
 *
 * prepareMerge(source, target)
 * → {
 *     identical: [],
 *     similarPairs: [{
 *       source: { text: 'Budget is $3000', ... },
 *       target: { text: 'Budget is $3500', ... },
 *       sourceConstraints: [{ value: '$3000', ... }],
 *       targetConstraints: [{ value: '$3500', ... }],
 *       resolution: undefined,  // user must set
 *     }],
 *     onlyInSource: [],
 *     onlyInTarget: []
 *   }
 */
export function prepareMerge(
  source: CommitContent,
  target: CommitContent
): Merge2WayResult {
  // Run diff
  // 运行 diff 算法
  const diff = diffCommits(source.sentences, target.sentences);

  // Build constraint lookup for both sides
  // 为两边构建约束查找表
  const sourceConstraintsBySentence = groupConstraintsBySentence(
    source.constraints ?? [],
    source.sentences
  );
  const targetConstraintsBySentence = groupConstraintsBySentence(
    target.constraints ?? [],
    target.sentences
  );

  // Map diff results to merge format
  // 将 diff 结果转换为 merge 格式

  // Similar pairs: user must choose source or target
  // 相似句子对：用户必须选择 source 或 target
  const similarPairs: MergeSimilarPair[] = diff.similar.map((pair) => ({
    source: pair.source,
    target: pair.target,
    wordDiff: pair.wordDiff,
    sourceConstraints: sourceConstraintsBySentence.get(pair.source.id) ?? [],
    targetConstraints: targetConstraintsBySentence.get(pair.target.id) ?? [],
    resolution: undefined, // User must decide
  }));

  // Only in source: user decides keep/discard
  // 仅在 source 中：用户决定保留或丢弃
  const onlyInSource: MergeCandidate[] = diff.onlyInSource.map((s) => ({
    sentence: s,
    constraints: sourceConstraintsBySentence.get(s.id) ?? [],
    keep: true, // Default to keep
  }));

  // Only in target: user decides keep/discard
  // 仅在 target 中：用户决定保留或丢弃
  const onlyInTarget: MergeCandidate[] = diff.onlyInTarget.map((s) => ({
    sentence: s,
    constraints: targetConstraintsBySentence.get(s.id) ?? [],
    keep: true, // Default to keep
  }));

  return {
    identical: diff.identical,
    similarPairs,
    onlyInSource,
    onlyInTarget,
  };
}
