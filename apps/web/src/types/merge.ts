/**
 * Merge Type Definitions for WebUI
 *
 * Re-exports merge types from @t3x/core and adds WebUI-specific types.
 */

// Import types for use in this file
// 导入类型以便在本文件中使用
import type { CommitAuthor, CommitContent, CommitV3, Constraint, WordDiffSegment } from '@t3x/core';

// Re-export for consumers of this module
// 重新导出供本模块的使用者使用
export type { Constraint, CommitAuthor, CommitContent, CommitV3, WordDiffSegment };

// ============================================================================
// Sentence Types (compatible with both commit.ts and commit-v3.ts formats)
// ============================================================================

/**
 * Sentence source - supports both legacy (type/id) and V3 (turn_hash) formats
 * 句子来源 - 支持旧格式和 V3 格式
 */
export interface SentenceSource {
  /** Legacy: Source type (e.g., 'conversation', 'turn') */
  type?: string;
  /** Legacy: Source identifier */
  id?: string;
  /** V3: Turn hash for tracing */
  turn_hash?: string;
  /** V3: Start character position */
  start_char?: number;
  /** V3: End character position */
  end_char?: number;
}

/**
 * A sentence - compatible with both legacy and V3 formats
 * 句子 - 兼容旧格式和 V3 格式
 *
 * Note: source is optional because DiffableSentence.source_ref is optional
 * in the core package. Some sentences (e.g., from executeMerge) may not have
 * source information.
 */
export interface Sentence {
  id: string;
  text: string;
  confidence?: number;
  source?: SentenceSource;
}

/**
 * A pair of similar sentences the user must choose between
 */
export interface MergeSimilarPair {
  source: Sentence;
  target: Sentence;
  wordDiff: WordDiffSegment[];
  resolution?: 'source' | 'target';
  sourceConstraints: Constraint[];
  targetConstraints: Constraint[];
}

/**
 * A unique sentence the user can keep or discard
 */
export interface MergeCandidate {
  sentence: Sentence;
  constraints: Constraint[];
  keep: boolean;
}

/**
 * Result of preparing a merge
 */
export interface Merge2WayResult {
  identical: Sentence[];
  similarPairs: MergeSimilarPair[];
  onlyInSource: MergeCandidate[];
  onlyInTarget: MergeCandidate[];
}

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

// ============================================================================
// Merge Draft Types (for Merge Workspace)
// ============================================================================

export type MergeDraftStatus = 'pending' | 'committed' | 'cancelled';

/**
 * Merge draft from API
 * API 返回的合并草稿
 */
export interface MergeDraft {
  draftId: string;
  projectId: string;
  sourceHash: string;
  targetHash: string;
  sourceBranch?: string | null;
  targetBranch?: string | null;
  prepared: Merge2WayResult;
  status: MergeDraftStatus;
  message?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Turn with context highlight information
 * 带有上下文高亮信息的 turn
 */
export interface TurnWithContext {
  turn_hash: string;
  parent_turn_hash: string | null;
  project_id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  language?: string | null;
  rings?: unknown;
  created_at: string;
  is_target: boolean;
  highlight?: {
    start: number;
    end: number;
  };
}

/**
 * Turn context data from API (for source tracing)
 * 来自 API 的 turn 上下文数据（用于溯源）
 */
export interface TurnContextData {
  target_turn: TurnWithContext;
  context: TurnWithContext[];
  conversation_id: string;
  conversation_title: string | null;
}
