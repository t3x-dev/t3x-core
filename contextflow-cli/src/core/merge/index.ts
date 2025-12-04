/**
 * Merge Module
 *
 * Re-exports merge types and engine from @contextflow/core.
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
} from "@contextflow/core";
