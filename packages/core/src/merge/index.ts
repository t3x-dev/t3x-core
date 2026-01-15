/**
 * Merge exports
 *
 * Two-way merge functions for combining two commits (Issue #71).
 */

// Two-way merge functions
export { executeMerge } from './executeMerge';
export { groupConstraintsBySentence, prepareMerge } from './prepareMerge';

// Two-way merge types
export {
  type Merge2WayResult,
  type MergeCandidate,
  type MergeSimilarPair,
} from './types';
