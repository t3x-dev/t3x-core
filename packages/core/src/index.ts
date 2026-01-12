/**
 * @t3x/core
 *
 * T3X Core - Deterministic semantic extraction, diff, and merge engine.
 *
 * This package provides:
 * - Ring 1/2/3 semantic extraction
 * - Semantic diff (two-way and three-way)
 * - Three-way merge with conflict detection
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
} from './types';
// Diff Engine
export {
  calculateDiffStats,
  createDiffEngine,
  DiffEngine,
  type DiffEngineConfig,
  type DiffResult,
  type DiffSegment,
  type DiffStats,
  DiffType,
  type SegmentDiff,
  type SegmentMatch,
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
// Merge Engine
export {
  type AutoMergedFacet,
  ConflictType,
  createMergeEngine,
  type MergeConflict,
  MergeEngine,
  type MergeEngineOptions,
  type MergeFacet,
  type MergeResult,
  type MergeSource,
  type MergeStats,
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
