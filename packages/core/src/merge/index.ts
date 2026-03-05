/**
 * Merge exports
 *
 * Two-way and three-way merge functions for combining commits.
 *
 * V4 Changes:
 * - No constraint handling (constraints belong to Leaf)
 * - prepareMerge accepts DiffableSentence[] instead of CommitContent
 * - executeMerge returns CommitV4 instead of CommitV3
 */

// Two-way merge functions
export { executeMerge } from './executeMerge';
export { prepareMerge, prepareMergeWithEmbeddings } from './prepareMerge';
// Smart merge suggestion (#10)
export { suggestMerge } from './suggestMerge';
// Three-way merge types
export type { ThreeWayConflict, ThreeWayMergeResult } from './threeWayMerge';
// Three-way merge functions
export { executeThreeWayMerge, prepareThreeWayMerge } from './threeWayMerge';
// Two-way merge types
export type {
  Merge2WayResult,
  MergeCandidate,
  MergeSimilarPair,
  MergeSuggestion,
} from './types';
