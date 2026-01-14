/**
 * Diff exports
 */

// Embedding-based diff engine
export {
  createDiffEngine,
  DiffEngine,
  type DiffEngineConfig,
} from './engine';

// Types
export {
  calculateDiffStats,
  type CommitDiff,
  type DiffResult,
  type DiffSegment,
  type DiffStats,
  DiffType,
  type SegmentDiff,
  type SegmentMatch,
  type SentencePair,
  type WordDiffSegment,
} from './types';

// Word-level diff (Issue #70)
export { tokenize } from './tokenize';
export { jaccard, JACCARD_THRESHOLD } from './jaccard';
export { lcs, wordDiff } from './lcs';
export { diffCommits } from './diffCommits';

// Hungarian algorithm - optimal matching (Issue #76)
export { buildSimilarityMatrix, hungarian, type MatchPair } from './hungarian';
