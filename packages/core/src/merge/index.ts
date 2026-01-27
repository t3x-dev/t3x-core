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

// Two-way merge types
export type {
  Merge2WayResult,
  MergeCandidate,
  MergeSimilarPair,
} from './types';
