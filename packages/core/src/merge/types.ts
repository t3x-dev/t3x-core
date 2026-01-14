/**
 * Merge Type Definitions
 *
 * Types for two-way merge operations (Issue #71).
 * Sentence-level merge for combining two commits.
 */

import type { Constraint, Sentence } from '../types/commit';
import type { WordDiffSegment } from '../diff/types';

/**
 * A pair of similar sentences the user must choose between
 * 相似句子对 - 用户必须在 source 和 target 之间选择一个
 */
export interface MergeSimilarPair {
  /** Source sentence (源句子) */
  source: Sentence;
  /** Target sentence (目标句子) */
  target: Sentence;
  /** Word-level diff between source and target (词级差异) */
  wordDiff: WordDiffSegment[];
  /** User's choice: 'source' or 'target' (no custom text allowed) (用户选择) */
  resolution?: 'source' | 'target';
  /** Constraints attached to source sentence (源句子关联的约束) */
  sourceConstraints: Constraint[];
  /** Constraints attached to target sentence (目标句子关联的约束) */
  targetConstraints: Constraint[];
}

/**
 * A unique sentence the user can keep or discard
 * 唯一句子 - 用户可以选择保留或丢弃
 */
export interface MergeCandidate {
  /** The sentence (句子) */
  sentence: Sentence;
  /** Constraints attached to this sentence (该句子关联的约束) */
  constraints: Constraint[];
  /** Whether to include in merged commit (default: true) (是否保留，默认 true) */
  keep: boolean;
}

/**
 * Result of preparing a merge - ready for user decisions
 * 合并准备结果 - 等待用户决策
 *
 * This structure is returned by prepareMerge() and consumed by UI.
 * User makes decisions, then executeMerge() creates the final commit.
 */
export interface Merge2WayResult {
  /** Sentences identical in both - auto-kept, no user action needed (完全相同的句子，自动保留) */
  identical: Sentence[];
  /** Similar pairs requiring user decision (pick source or target) (相似句子对，需要用户选择) */
  similarPairs: MergeSimilarPair[];
  /** Sentences only in source - user decides keep/discard (仅在 source 中，用户决定是否保留) */
  onlyInSource: MergeCandidate[];
  /** Sentences only in target - user decides keep/discard (仅在 target 中，用户决定是否保留) */
  onlyInTarget: MergeCandidate[];
}
