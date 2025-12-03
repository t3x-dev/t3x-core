/**
 * Diff Module
 *
 * Re-exports diff types and engine from @contextflow/core.
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
} from "@contextflow/core";
