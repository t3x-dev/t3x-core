/**
 * Diff Module
 *
 * Re-exports diff types and engine from @t3x/core.
 */

export {
  // Types
  DiffType,
  type SegmentMatch,
  type SegmentDiff,
  type DiffSegment,
  type DiffResult,
  type DiffStats,
  calculateDiffStats,
  // Engine
  type DiffEngineConfig,
  DiffEngine,
  createDiffEngine,
} from "@t3x/core";
