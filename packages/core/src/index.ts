/**
 * @t3x/core
 *
 * T3X Core - Deterministic semantic extraction, diff, and merge engine.
 *
 * This package provides:
 * - Ring 1/2/3 semantic extraction
 * - Semantic diff (two-way)
 * - Two-way merge for combining commits
 * - Provider interfaces (NLP, Embedding, LLM)
 *
 * All operations are deterministic and do not depend on LLMs.
 */

// Common utilities
export { canonText, computeCommitV3Hash, hashText, sha256 } from './common';
// Commit Builders
export {
  buildConstraints,
  buildSentencesFromSegments,
  findBestSourceSentenceId,
  getDockerAuthor,
  getLocalAuthor,
  getWebAuthor,
} from './commit';
// CommitV3 types
export type {
  CommitAuthor,
  CommitContent,
  CommitV3,
  Constraint,
  ExcludeConstraint,
  RequireConstraint,
  Sentence,
  SentenceSource,
} from './types';
// Diff Engine
export {
  buildSimilarityMatrix,
  calculateDiffStats,
  type CommitDiff,
  createDiffEngine,
  DiffEngine,
  type DiffEngineConfig,
  diffCommits,
  type DiffResult,
  type DiffSegment,
  type DiffStats,
  DiffType,
  hungarian,
  jaccard,
  JACCARD_THRESHOLD,
  lcs,
  type MatchPair,
  type SegmentDiff,
  type SegmentMatch,
  type SentencePair,
  tokenize,
  wordDiff,
  type WordDiffSegment,
} from './diff';
// Extractors (Ring 1/2/3)
export {
  // v1.1: Anchor types
  type AnchorCandidate,
  type AnchorSource,
  type AnchorType,
  createEmptyRing1,
  createEmptyRing2,
  createEmptyRing3,
  createEmptyRingOutput,
  createPolarityRuleEngine,
  createRingExtractor,
  // Ring Extractor
  type ExtractorConfig,
  type Facet,
  type FacetType,
  type Keyword,
  type Polarity,
  // Polarity Rules
  type PolarityRule,
  PolarityRuleEngine,
  // Types
  type PosTag,
  type PreferenceRelation,
  type Ring1Output,
  type Ring2Output,
  type Ring3Output,
  RingExtractor,
  type RingOutput,
  type Segment,
} from './extractors';
// LLM Provider (interface)
export {
  type LLMGenerateOptions,
  type LLMProvider,
  LLMProviderError,
} from './llm';
// Merge (Two-way merge for combining two commits - Issue #71)
export {
  executeMerge,
  groupConstraintsBySentence,
  type Merge2WayResult,
  type MergeCandidate,
  type MergeSimilarPair,
  prepareMerge,
} from './merge';
// Provider interfaces and implementations
export {
  type CachedEmbeddingConfig,
  CachedEmbeddingProvider,
  // LLM Provider (implementations)
  ClaudeProvider,
  type ClaudeProviderConfig,
  cosineSimilarity,
  createCachedEmbeddingProvider,
  createClaudeProvider,
  createGoogleAIEmbeddingProvider,
  // NLP Provider (Google Cloud)
  createGoogleCloudNLPProvider,
  type DependencyLabel,
  // Embedding Provider (interface)
  type EmbeddingProvider,
  EmbeddingProviderError,
  type GoogleAIEmbeddingConfig,
  type GoogleCloudNLPConfig,
  // Embedding Provider (implementations)
  GoogleAIEmbeddingProvider,
  // NLP Provider (implementations)
  GoogleCloudNLPProvider,
  type NLPAnalysis,
  type NLPEntity,
  type NLPProvider,
  NLPProviderError,
  type NLPSentence,
  type NLPToken,
  normalizeDependencyLabel,
  normalizePosTag,
  POS_TAG_MAPPING,
} from './providers';

// Storage (types + pure utils only)
// For CRUD operations, use @t3x/storage package
export * from './storage';

// ═══════════════════════════════════════════════════════════════════════════
// V4 Architecture Types
// @see docs/specification/semantic-layer-architecture.md
// @see docs/specification/memory-pin-system-design.md
// ═══════════════════════════════════════════════════════════════════════════
export {
  // ID Prefixes
  ID_PREFIXES,
  // Sentence
  type Sentence as SentenceV4,
  type SentenceSourceRef,
  // CommitV4 (pure knowledge, no constraints)
  type CommitV4,
  type CommitV4Content,
  type CommitAuthor as CommitAuthorV4,
  type CommitSourceRef,
  // Constraint (now belongs to Leaf)
  type Constraint as ConstraintV4,
  type RequireConstraint as RequireConstraintV4,
  type ExcludeConstraint as ExcludeConstraintV4,
  // Assertion
  type Assertion,
  // Leaf (owns constraints)
  type Leaf,
  type LeafType,
  type LeafConfig,
  // Pin (source selection)
  type Pin,
  type PinType,
  // Conversation Context
  type ConversationContext,
  // Built Context
  type BuiltContext,
  type ContextSource,
  // Input types
  type CreateCommitV4Input,
  type CreateLeafInput,
  type CreatePinInput,
  // Merge V4 types
  type MergeV4Result,
  type MergeV4SimilarPair,
  type MergeV4Candidate,
  type WordDiffSegment as WordDiffSegmentV4,
} from './types/v4';

// ═══════════════════════════════════════════════════════════════════════════
// Context Builder (V4)
// @see docs/specification/memory-pin-system-design.md
// ═══════════════════════════════════════════════════════════════════════════
export {
  buildConversationContext,
  buildLeafContext,
  buildMemoryFromPins,
  type ContextBuildInput,
  type ConversationData,
  estimateTokens,
  filterActivePins,
} from './context';
