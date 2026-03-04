/**
 * Diff exports
 */

// Four-level classification (Upgrade #5)
export {
  type ClassifiedCommitDiff,
  type ClassifiedSentencePair,
  classifyDiff,
  type DiffClassification,
  EQUIVALENT_THRESHOLD,
} from './classify';
export { diffCommits } from './diffCommits';
// Embedding-based diff engine
export {
  createDiffEngine,
  DiffEngine,
  type DiffEngineConfig,
} from './engine';
// Hungarian algorithm - optimal matching (Issue #76)
export { buildSimilarityMatrix, hungarian, type MatchPair } from './hungarian';
// Incremental diff with caching (Item 13)
export { type DiffCache, incrementalDiffCommits } from './incrementalDiff';
export { JACCARD_THRESHOLD, jaccard } from './jaccard';
export { lcs, wordDiff } from './lcs';
// Word-level diff (Issue #70)
export { lightStem, tokenize, tokenizeForMatching } from './tokenize';
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
