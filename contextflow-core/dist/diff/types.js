"use strict";
/**
 * Diff Type Definitions
 *
 * Types for semantic diff operations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiffType = void 0;
exports.calculateDiffStats = calculateDiffStats;
/**
 * Diff type enumeration
 */
var DiffType;
(function (DiffType) {
    /** Same (similarity above threshold) */
    DiffType["SAME"] = "same";
    /** Added (only in target version) */
    DiffType["ADDED"] = "added";
    /** Removed (only in source version) */
    DiffType["REMOVED"] = "removed";
    /** Modified (has match but content differs) */
    DiffType["MODIFIED"] = "modified";
    /** Conflict (both sides modified in three-way merge) */
    DiffType["CONFLICT"] = "conflict";
})(DiffType || (exports.DiffType = DiffType = {}));
/**
 * Calculate statistics from segment diffs
 */
function calculateDiffStats(segmentDiffs) {
    const stats = {
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
//# sourceMappingURL=types.js.map