/**
 * Merge Type Definitions
 *
 * Types for three-way merge operations.
 */

/**
 * Conflict type enumeration
 */
export enum ConflictType {
  /** Both sides edited the same facet with different values */
  DIVERGENT_EDIT = 'divergent_edit',
  /** Source deleted, target modified */
  DELETE_MODIFY = 'delete_modify',
  /** Source modified, target deleted */
  MODIFY_DELETE = 'modify_delete',
}

/**
 * Source of merged content
 */
export type MergeSource = 'base' | 'source' | 'target' | 'llm' | 'manual';

/**
 * Input facet for merge operation
 */
export interface MergeFacet {
  /** Facet unique identifier (for tracking) */
  id?: string;
  /** Facet name/identifier (key for merge matching) */
  facet?: string;
  /** Facet type for grouping (e.g., "menu_item", "constraint") */
  type?: string;
  /** Facet text content */
  text: string | null;
  /** Associated keywords */
  keywords?: string[];
  /** Confidence score (0-1) for prioritizing during conflicts */
  confidence?: number;
}

/**
 * Auto-merged facet result
 */
export interface AutoMergedFacet {
  /** Facet name */
  facet: string;
  /** Merged text content */
  mergedText: string | null;
  /** Source of the merged content */
  source: MergeSource;
  /** Associated keywords */
  keywords: string[];
}

/**
 * Merge conflict
 */
export interface MergeConflict {
  /** Facet name */
  facet: string;
  /** Base version text */
  baseText: string | null;
  /** Source branch text */
  sourceText: string | null;
  /** Target branch text */
  targetText: string | null;
  /** Type of conflict */
  conflictType: ConflictType;
}

/**
 * Merge result
 */
export interface MergeResult {
  /** Auto-merged facets (no conflicts) */
  autoMerged: AutoMergedFacet[];
  /** Conflicts requiring manual resolution */
  conflicts: MergeConflict[];
  /** Merge status */
  status: 'clean' | 'conflicts';
  /** Statistics */
  stats: MergeStats;
}

/**
 * Merge statistics
 */
export interface MergeStats {
  /** Total number of facets processed */
  totalFacets: number;
  /** Number of auto-merged facets */
  autoMergedCount: number;
  /** Number of conflicts */
  conflictCount: number;
  /** Number of conflicts resolved by LLM */
  llmResolvedCount: number;
  /** Breakdown by source */
  bySource: {
    base: number;
    source: number;
    target: number;
    llm: number;
    manual: number;
  };
}

// ============================================================================
// Two-Way Merge Types (Issue #71)
// Sentence-level merge for combining two commits
// 两路合并类型 - 用于合并两个 commit 的句子级别操作
// ============================================================================

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
