/**
 * Merge exports
 *
 * Two-way merge functions for combining two commits (Issue #71).
 *
 * V4 Changes:
 * - No constraint handling (constraints belong to Leaf)
 * - prepareMerge accepts DiffableSentence[] instead of CommitContent
 * - executeMerge returns CommitV4 instead of CommitV3
 */

// Two-way merge functions
export { executeMerge } from './executeMerge';
export { prepareMerge } from './prepareMerge';
// Smart merge suggestion (#10)
export { suggestMerge } from './suggestMerge';

// Two-way merge types
export type {
  Merge2WayResult,
  MergeCandidate,
  MergeSimilarPair,
  MergeSuggestion,
} from './types';
