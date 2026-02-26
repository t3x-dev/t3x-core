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

// Commit Builders
export {
  buildConstraints,
  buildSentencesFromSegments,
  findBestSourceSentenceId,
  getDockerAuthor,
  getLocalAuthor,
  getWebAuthor,
} from './commit';
// Common utilities
export { canonText, computeCommitV3Hash, hashText, sha256 } from './common';
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
// Diff Engine
export {
  buildSimilarityMatrix,
  type CommitDiff,
  calculateDiffStats,
  createDiffEngine,
  type DiffableSentence,
  DiffEngine,
  type DiffEngineConfig,
  type DiffResult,
  type DiffSegment,
  type DiffStats,
  DiffType,
  diffCommits,
  hungarian,
  JACCARD_THRESHOLD,
  jaccard,
  lcs,
  type MatchPair,
  type SegmentDiff,
  type SegmentMatch,
  type SentencePair,
  tokenize,
  type WordDiffSegment,
  wordDiff,
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
// ═══════════════════════════════════════════════════════════════════════════
// Leaf Module (Generation + Validation)
// @see docs/plans/parallel-dev-guidelines.md
// ═══════════════════════════════════════════════════════════════════════════
export {
  // Types
  type BuildPromptOptions,
  type BuiltPrompt,
  // Generation (GEN-1)
  buildLeafPrompt,
  buildSystemPrompt,
  type ConstraintCheckResult,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  // Default templates
  DEFAULT_TEMPLATES,
  formatConstraints,
  type GenerateOptions,
  type GenerateResult,
  GenerationError,
  generateAssertionId,
  // Generation (GEN-2)
  generateLeafOutput,
  getAllDefaultTemplates,
  getDefaultTemplate,
  getTypeInstructions,
  isGenerationConfigured,
  type LeafTemplate,
  SEMANTIC_EXCLUDE_THRESHOLD,
  // Constants
  SEMANTIC_REQUIRE_THRESHOLD,
  type ValidateOptions,
  type ValidationResult,
  // Validation (VAL-1, VAL-2)
  validateConstraints,
  validateConstraintsExactOnly,
  validateTemplateSyntax,
} from './leaf';
// LLM Provider (interface)
export {
  type LLMGenerateOptions,
  type LLMProvider,
  LLMProviderError,
} from './llm';
// Merge (Two-way merge for combining two commits - Issue #71)
// V4: No constraint handling, prepareMerge accepts DiffableSentence[]
export {
  executeMerge,
  type Merge2WayResult,
  type MergeCandidate,
  type MergeSimilarPair,
  prepareMerge,
} from './merge';
// Provider interfaces and implementations
export {
  type AnyProvider,
  type CachedEmbeddingConfig,
  CachedEmbeddingProvider,
  // LLM Provider (implementations)
  ClaudeProvider,
  type ClaudeProviderConfig,
  cosineSimilarity,
  createCachedEmbeddingProvider,
  createClaudeProvider,
  createDeepSeekProvider,
  createGoogleAIEmbeddingProvider,
  // NLP Provider (Google Cloud)
  createGoogleCloudNLPProvider,
  createOllamaEmbeddingProvider,
  createOllamaProvider,
  createOpenAIEmbeddingProvider,
  createOpenAIProvider,
  // Provider Registry
  createProviderRegistry,
  type DeepSeekProviderConfig,
  DeepSeekProvider,
  type DependencyLabel,
  // Embedding Provider (interface)
  type EmbeddingProvider,
  EmbeddingProviderError,
  type GoogleAIEmbeddingConfig,
  // Embedding Provider (implementations)
  GoogleAIEmbeddingProvider,
  type GoogleCloudNLPConfig,
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
  type OllamaEmbeddingConfig,
  OllamaEmbeddingProvider,
  type OllamaProviderConfig,
  OllamaProvider,
  type OpenAIEmbeddingConfig,
  OpenAIEmbeddingProvider,
  type OpenAIProviderConfig,
  OpenAIProvider,
  POS_TAG_MAPPING,
  type ProviderEntry,
  ProviderRegistry,
  type ProviderRole,
  type RegistryConfig,
  type ResolvedConfig,
  type RoleAssignment,
  type TestConnectionResult,
} from './providers';
// Storage (types + pure utils only)
// For CRUD operations, use @t3x/storage package
export * from './storage';
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
// ═══════════════════════════════════════════════════════════════════════════
// V4 Architecture Types
// @see docs/specification/semantic-layer-architecture.md
// @see docs/specification/memory-pin-system-design.md
// ═══════════════════════════════════════════════════════════════════════════
export {
  ALL_LEAF_TYPES,
  // Leaf (owns constraints)
  type AnyLeafType,
  API_KEY_VALUE_PREFIX,
  // API Key
  type ApiKey,
  // Assertion
  type Assertion,
  // Built Context
  type BuiltContext,
  type CommitAuthor as CommitAuthorV4,
  type CommitSourceRef,
  // CommitV4 (pure knowledge, no constraints)
  type CommitV4,
  type CommitV4Content,
  // Constraint (now belongs to Leaf)
  type Constraint as ConstraintV4,
  type ContextSource,
  // Conversation Context
  type ConversationContext,
  // Input types
  type CreateCommitV4Input,
  // Draft (Workbench)
  type CreateDraftInput as CreateDraftV3Input,
  type CreateLeafHistoryInput,
  type CreateLeafInput,
  type CreatePinInput,
  DEPLOY_TYPES,
  type DeployType,
  type Draft,
  type DraftConstraint,
  type DraftSentence,
  type DraftSentenceOrigin,
  type DraftStatus as DraftV4Status,
  type ExcludeConstraint as ExcludeConstraintV4,
  // ID Prefixes
  ID_PREFIXES,
  isDeployLeaf,
  isGenerationLeaf,
  LEAF_TYPES,
  type Leaf,
  type LeafConfig,
  // Leaf History
  type LeafHistory,
  type LeafType,
  // Merge summary
  type MergeSummaryData,
  type MergeV4Candidate,
  // Merge V4 types
  type MergeV4Result,
  type MergeV4SimilarPair,
  // Pin (source selection)
  type Pin,
  type PinType,
  type RequireConstraint as RequireConstraintV4,
  // Sentence
  type Sentence as SentenceV4,
  type SentenceSourceRef,
  // Share Token
  type ShareToken,
  type WordDiffSegment as WordDiffSegmentV4,
} from './types/v4';
