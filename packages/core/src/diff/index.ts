/**
 * Diff exports
 */

export { diffCommits } from './diffCommits';
// Embedding-based diff engine
export {
  createDiffEngine,
  DiffEngine,
  type DiffEngineConfig,
} from './engine';
// Hungarian algorithm - optimal matching (Issue #76)
export { buildSimilarityMatrix, hungarian, type MatchPair } from './hungarian';
export { JACCARD_THRESHOLD, jaccard } from './jaccard';
export { lcs, wordDiff } from './lcs';
// Word-level diff (Issue #70)
export { tokenize } from './tokenize';
// Types
export {
  type CommitDiff,
  calculateDiffStats,
  type DiffableSentence,
  type DiffResult,
  type DiffSegment,
  type DiffStats,
  DiffType,
  type SegmentDiff,
  type SegmentMatch,
  type SentencePair,
  type WordDiffSegment,
} from './types';
