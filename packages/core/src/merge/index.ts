/**
 * Merge exports
 */

export {
  createMergeEngine,
  MergeEngine,
  type MergeEngineOptions,
} from './engine';
// Two-way merge functions (Issue #71)
export { executeMerge } from './executeMerge';
export { groupConstraintsBySentence, prepareMerge } from './prepareMerge';
export {
  type AutoMergedFacet,
  ConflictType,
  // Two-way merge types (Issue #71)
  type Merge2WayResult,
  type MergeCandidate,
  type MergeConflict,
  type MergeFacet,
  type MergeResult,
  type MergeSimilarPair,
  type MergeSource,
  type MergeStats,
} from './types';
