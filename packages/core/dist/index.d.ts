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
export { canonText, hashText, sha256 } from './common';
export { calculateDiffStats, createDiffEngine, DiffEngine, type DiffEngineConfig, type DiffResult, type DiffSegment, type DiffStats, DiffType, type SegmentDiff, type SegmentMatch, } from './diff';
export { createEmptyRing1, createEmptyRing2, createEmptyRing3, createEmptyRingOutput, createPolarityRuleEngine, createRingExtractor, type ExtractorConfig, type Facet, type FacetType, type Keyword, type Polarity, type PolarityRule, PolarityRuleEngine, type PosTag, type PreferenceRelation, type Ring1Output, type Ring2Output, type Ring3Output, RingExtractor, type RingOutput, type Segment, } from './extractors';
export { type LLMGenerateOptions, type LLMProvider, LLMProviderError, } from './llm';
export { type AutoMergedFacet, ConflictType, createMergeEngine, type MergeConflict, MergeEngine, type MergeEngineOptions, type MergeFacet, type MergeResult, type MergeSource, type MergeStats, } from './merge';
export { type CachedEmbeddingConfig, CachedEmbeddingProvider, ClaudeProvider, type ClaudeProviderConfig, cosineSimilarity, createCachedEmbeddingProvider, createClaudeProvider, createGoogleAIEmbeddingProvider, type DependencyLabel, type EmbeddingProvider, EmbeddingProviderError, type GoogleAIEmbeddingConfig, GoogleAIEmbeddingProvider, type NLPAnalysis, type NLPEntity, type NLPProvider, NLPProviderError, type NLPSentence, type NLPToken, normalizeDependencyLabel, normalizePosTag, POS_TAG_MAPPING, } from './providers';
export * from './storage';
//# sourceMappingURL=index.d.ts.map