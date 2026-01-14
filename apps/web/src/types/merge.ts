/**
 * Merge Type Definitions for WebUI
 *
 * Re-exports merge types from @t3x/core and adds WebUI-specific types.
 */

// Import types for use in this file
// 导入类型以便在本文件中使用
import type {
  Sentence,
  Constraint,
  CommitAuthor,
  CommitContent,
  CommitV3,
  WordDiffSegment,
  MergeSimilarPair,
  MergeCandidate,
  Merge2WayResult,
} from '@t3x/core';

// Re-export for consumers of this module
// 重新导出供本模块的使用者使用
export type {
  Sentence,
  Constraint,
  CommitAuthor,
  CommitContent,
  CommitV3,
  WordDiffSegment,
  MergeSimilarPair,
  MergeCandidate,
  Merge2WayResult,
};

/**
 * Current merge operation state in canvas store
 * Canvas Store 中的当前合并操作状态
 *
 * This state tracks an ongoing merge operation initiated by the user.
 * It holds the source/target commits and the prepared merge result.
 */
export interface MergeState {
  /** Source commit hash (源 commit 的 hash) */
  sourceHash: string;

  /** Target commit hash (目标 commit 的 hash) */
  targetHash: string;

  /** Optional source branch name (可选的源分支名称) */
  sourceBranch?: string;

  /** Optional target branch name (可选的目标分支名称) */
  targetBranch?: string;

  /** Prepared merge result from API (来自 API 的合并准备结果) */
  prepared: Merge2WayResult;
}
