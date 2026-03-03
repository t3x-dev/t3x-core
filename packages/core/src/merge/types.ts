/**
 * Merge Type Definitions
 *
 * Types for two-way merge operations (Issue #71).
 * Sentence-level merge for combining two commits.
 */

import type { DiffableSentence, WordDiffSegment } from '../diff/types';

export interface MergeSuggestion {
  suggestion: string;
  reasoning: string;
}

/**
 * A pair of similar sentences the user must choose between.
 * 相似句子对 - 用户必须在 source 和 target 之间选择一个
 *
 * V4 Change: No constraint fields (constraints belong to Leaf).
 * FROZEN - Do not modify without team agreement.
 */
export interface MergeSimilarPair {
  /** Source sentence (源句子) */
  source: DiffableSentence;
  /** Target sentence (目标句子) */
  target: DiffableSentence;
  /** Word-level diff between source and target (词级差异) */
  wordDiff: WordDiffSegment[];
  /** User's choice: 'source' or 'target' (no custom text allowed) (用户选择) */
  resolution?: 'source' | 'target';
  /** LLM-suggested merged text (#10), null if no LLM configured */
  suggestion?: MergeSuggestion | null;
  // REMOVED: sourceConstraints, targetConstraints (V4: constraints belong to Leaf)
}

/**
 * A unique sentence the user can keep or discard.
 * 唯一句子 - 用户可以选择保留或丢弃
 *
 * V4 Change: No constraints field (constraints belong to Leaf).
 * FROZEN - Do not modify without team agreement.
 */
export interface MergeCandidate {
  /** The sentence (句子) */
  sentence: DiffableSentence;
  /** Whether to include in merged commit (default: true) (是否保留，默认 true) */
  keep: boolean;
  // REMOVED: constraints (V4: constraints belong to Leaf)
}

/**
 * Result of preparing a merge - ready for user decisions.
 * 合并准备结果 - 等待用户决策
 *
 * This structure is returned by prepareMerge() and consumed by UI.
 * User makes decisions, then executeMerge() creates the final commit.
 *
 * FROZEN - Do not modify without team agreement.
 */
export interface Merge2WayResult {
  /** Sentences identical in both - auto-kept, no user action needed (完全相同的句子，自动保留) */
  identical: DiffableSentence[];
  /** Similar pairs requiring user decision (pick source or target) (相似句子对，需要用户选择) */
  similarPairs: MergeSimilarPair[];
  /** Sentences only in source - user decides keep/discard (仅在 source 中，用户决定是否保留) */
  onlyInSource: MergeCandidate[];
  /** Sentences only in target - user decides keep/discard (仅在 target 中，用户决定是否保留) */
  onlyInTarget: MergeCandidate[];
}
