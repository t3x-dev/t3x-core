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
export { type DependencyLabel, type NLPToken, type NLPEntity, type NLPSentence, type NLPAnalysis, type NLPProvider, NLPProviderError, POS_TAG_MAPPING, normalizePosTag, normalizeDependencyLabel, type EmbeddingProvider, EmbeddingProviderError, cosineSimilarity, } from './providers';
export { type LLMGenerateOptions, type LLMProvider, LLMProviderError, } from './llm';
export { type PosTag, type Polarity, type FacetType, type Keyword, type Ring1Output, type Facet, type Ring2Output, type Segment, type Ring3Output, type RingOutput, createEmptyRing1, createEmptyRing2, createEmptyRing3, createEmptyRingOutput, type PolarityRule, type PreferenceRelation, PolarityRuleEngine, createPolarityRuleEngine, type ExtractorConfig, RingExtractor, createRingExtractor, } from './extractors';
export { DiffType, type SegmentMatch, type SegmentDiff, type DiffSegment, type DiffResult, type DiffStats, calculateDiffStats, type DiffEngineConfig, DiffEngine, createDiffEngine, } from './diff';
export { ConflictType, type MergeSource, type MergeFacet, type AutoMergedFacet, type MergeConflict, type MergeResult, type MergeStats, type MergeEngineOptions, MergeEngine, createMergeEngine, } from './merge';
export * from './storage';
//# sourceMappingURL=index.d.ts.map