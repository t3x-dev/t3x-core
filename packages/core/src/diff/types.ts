/**
 * Diff Type Definitions
 *
 * Types for semantic diff operations.
 */

// Note: No longer imports Sentence - uses DiffableSentence for V4 compatibility

// ============================================================================
// Minimal Interface for V4 Migration (Issue #196, #203)
// ============================================================================

/**
 * Minimal interface for diff/merge operations.
 *
 * Only id and text are needed for diff algorithms.
 * Both V4 Sentence and any object with these fields can be used directly.
 *
 * source_ref is optional but preserved through merge for source context display.
 */
export interface DiffableSentence {
  /** Unique sentence identifier */
  id: string;
  /** Sentence text content */
  text: string;
  /** Optional: Source reference for context display (preserved through merge) */
  source_ref?: {
    conversation_id: string;
    turn_hash: string;
    start_char: number;
    end_char: number;
  };
}

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
 * A pair of similar sentences with their word-level diff.
 *
 * FROZEN - Do not modify without team agreement.
 */
export interface SentencePair {
  /** Source sentence (源句子) */
  source: DiffableSentence;
  /** Target sentence (目标句子) */
  target: DiffableSentence;
  /** Jaccard similarity score (0-1) (相似度分数) */
  similarity: number;
  /** Word-level diff segments (词级差异片段) */
  wordDiff: WordDiffSegment[];
}

/**
 * Result of comparing two commits.
 *
 * FROZEN - Do not modify without team agreement.
 */
export interface CommitDiff {
  /** Sentences with identical text in both commits (两边完全相同的句子) */
  identical: DiffableSentence[];
  /** Sentences that are similar (Jaccard >= 0.3) with word diffs (相似句子对) */
  similar: SentencePair[];
  /** Sentences only in source commit (removed/old) (仅在源 commit 中) */
  onlyInSource: DiffableSentence[];
  /** Sentences only in target commit (added/new) (仅在目标 commit 中) */
  onlyInTarget: DiffableSentence[];
}
