/**
 * Merge Module
 *
 * Re-exports merge types and engine from @t3x/core.
 */

export {
  // Types
  ConflictType,
  type MergeSource,
  type MergeFacet,
  type AutoMergedFacet,
  type MergeConflict,
  type MergeResult,
  type MergeStats,
  type MergeEngineOptions,
  // Engine
  MergeEngine,
  createMergeEngine,
} from "@t3x/core";
