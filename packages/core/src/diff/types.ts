/**
 * Diff Type Definitions
 *
 * Types for semantic diff operations.
 */

import type { Sentence } from '../types/commit';

/**
 * Diff type enumeration
 */
export enum DiffType {
  /** Same (similarity above threshold) */
  SAME = 'same',
  /** Added (only in target version) */
  ADDED = 'added',
  /** Removed (only in source version) */
  REMOVED = 'removed',
  /** Modified (has match but content differs) */
  MODIFIED = 'modified',
  /** Conflict (both sides modified in three-way merge) */
  CONFLICT = 'conflict',
}

/**
 * Segment match result
 *
 * Records similarity and match relationship between two segments.
 */
export interface SegmentMatch {
  /** Source segment ID */
  sourceSegmentId: string;
  /** Target segment ID */
  targetSegmentId: string;
  /** Similarity score [0, 1] */
  similarity: number;
  /** Whether exceeds threshold */
  matched: boolean;
}

/**
 * Diff result for single segment
 *
 * Corresponds to "sentence-level semantic Diff" in documentation.
 */
export interface SegmentDiff {
  /** Segment ID */
  segmentId: string;
  /** Segment text */
  text: string;
  /** Diff type */
  diffType: DiffType;
  /** Similarity score (if matched) */
  similarity?: number;
  /** Matched segment ID from other side */
  matchedSegmentId?: string;
  /** Matched segment text from other side */
  matchedText?: string;
}

/**
 * Input segment format
 */
export interface DiffSegment {
  /** Segment ID */
  segmentId: string;
  /** Segment text */
  text: string;
}

/**
 * Diff result
 *
 * Contains diff information for all segments.
 */
export interface DiffResult {
  /** Base version ID (Commit Hash or "draft") */
  baseId: string;
  /** Target version ID */
  targetId: string;
  /** Source Branch version ID (three-way diff only) */
  sourceId?: string;
  /** All segment diffs */
  segmentDiffs: SegmentDiff[];
  /** Similarity threshold used */
  threshold: number;
  /** Statistics */
  stats: DiffStats;
}

/**
 * Diff statistics
 */
export interface DiffStats {
  /** Total number of segments */
  totalSegments: number;
  /** Number of same segments */
  sameCount: number;
  /** Number of added segments */
  addedCount: number;
  /** Number of removed segments */
  removedCount: number;
  /** Number of modified segments */
  modifiedCount: number;
  /** Number of conflict segments */
  conflictCount: number;
}

/**
 * Calculate statistics from segment diffs
 */
export function calculateDiffStats(segmentDiffs: SegmentDiff[]): DiffStats {
  const stats: DiffStats = {
    totalSegments: segmentDiffs.length,
    sameCount: 0,
    addedCount: 0,
    removedCount: 0,
    modifiedCount: 0,
    conflictCount: 0,
  };

  for (const diff of segmentDiffs) {
    switch (diff.diffType) {
      case DiffType.SAME:
        stats.sameCount++;
        break;
      case DiffType.ADDED:
        stats.addedCount++;
        break;
      case DiffType.REMOVED:
        stats.removedCount++;
        break;
      case DiffType.MODIFIED:
        stats.modifiedCount++;
        break;
      case DiffType.CONFLICT:
        stats.conflictCount++;
        break;
    }
  }

  return stats;
}

// ============================================================================
// Word-level Diff Types (Issue #70)
// ============================================================================

/**
 * A segment of word-level diff output
 */
export interface WordDiffSegment {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
}

/**
 * A pair of similar sentences with their word-level diff
 */
export interface SentencePair {
  /** Source sentence */
  source: Sentence;
  /** Target sentence */
  target: Sentence;
  /** Jaccard similarity score (0-1) */
  similarity: number;
  /** Word-level diff segments */
  wordDiff: WordDiffSegment[];
}

/**
 * Result of comparing two commits
 */
export interface CommitDiff {
  /** Sentences with identical text in both commits */
  identical: Sentence[];
  /** Sentences that are similar (Jaccard >= 0.3) with word diffs */
  similar: SentencePair[];
  /** Sentences only in source commit (removed/old) */
  onlyInSource: Sentence[];
  /** Sentences only in target commit (added/new) */
  onlyInTarget: Sentence[];
}

// ============================================================================
// Smart Diff Types (Issue #76 - Phase 2)
// Combines text matching (Layer 1) with semantic matching (Layer 2)
// ============================================================================

/**
 * Semantic match - sentences with different text but similar meaning
 * 语义匹配 - 文字不同但意思相似的句子（如"买车" vs "购买汽车"）
 */
export interface SemanticMatch {
  /** Source sentence (源句子) */
  source: Sentence;
  /** Target sentence (目标句子) */
  target: Sentence;
  /** Embedding similarity score 0-1 (语义相似度，由 Embedding 计算) */
  semanticSimilarity: number;
  /** Jaccard text similarity score 0-1 (文字相似度，由 Jaccard 计算) */
  textSimilarity: number;
}

/**
 * Smart diff statistics
 * 智能差异统计信息
 */
export interface SmartDiffStats {
  /** Total sentences in source (源句子总数) */
  totalSource: number;
  /** Total sentences in target (目标句子总数) */
  totalTarget: number;
  /** Identical sentences count (完全相同数量) */
  identicalCount: number;
  /** Text-similar sentences count (文字相似数量) */
  textSimilarCount: number;
  /** Semantic match count (语义匹配数量) */
  semanticMatchCount: number;
  /** Added sentences count (新增数量) */
  addedCount: number;
  /** Removed sentences count (删除数量) */
  removedCount: number;
}

/**
 * Smart diff result - combines text and semantic matching
 * 智能差异结果 - 结合文字匹配（Layer 1）和语义匹配（Layer 2）
 *
 * Layer 1 (Deterministic): Hungarian + Jaccard + LCS
 * Layer 2 (Semantic): Embedding similarity (optional)
 */
export interface SmartDiffResult {
  /** Sentences with identical text (完全相同的句子) */
  identical: Sentence[];
  /** Text-similar sentences with word-level diff (文字相似，有词级差异) */
  textSimilar: SentencePair[];
  /** Semantically similar but textually different (语义相似但文字不同，换了说法) */
  semanticMatch: SemanticMatch[];
  /** Only in source - truly removed (仅在源中 - 真正被删除) */
  onlyInSource: Sentence[];
  /** Only in target - truly added (仅在目标中 - 真正新增) */
  onlyInTarget: Sentence[];
  /** Statistics (统计信息) */
  stats: SmartDiffStats;
}
