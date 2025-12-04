/**
 * Diff Type Definitions
 *
 * Types for semantic diff operations.
 */
/**
 * Diff type enumeration
 */
export declare enum DiffType {
    /** Same (similarity above threshold) */
    SAME = "same",
    /** Added (only in target version) */
    ADDED = "added",
    /** Removed (only in source version) */
    REMOVED = "removed",
    /** Modified (has match but content differs) */
    MODIFIED = "modified",
    /** Conflict (both sides modified in three-way merge) */
    CONFLICT = "conflict"
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
export declare function calculateDiffStats(segmentDiffs: SegmentDiff[]): DiffStats;
//# sourceMappingURL=types.d.ts.map