/**
 * @t3x-dev/core
 *
 * T3X Core - Deterministic semantic extraction, diff, and merge engine.
 *
 * This package provides:
 * - Frame semantic extraction
 * - Semantic diff (two-way)
 * - Two-way merge for combining commits
 * - Provider interfaces (NLP, Embedding, LLM)
 *
 * All operations are deterministic and do not depend on LLMs.
 */

// Autopilot (auto-commit evaluator)
export {
  type AutoCommitCandidate,
  type AutoCommitPlan,
  type AutopilotConfig,
  DEFAULT_AUTOPILOT_CONFIG,
  evaluateAutoCommit,
  mergeAutopilotConfig,
} from './autopilot';
// Commit (frame-based)
export {
  type Author,
  COMMIT_SCHEMA,
  type Commit,
  type CommitFirstClass,
  computeCommitHash,
  type Provenance,
  type Source,
  upgradeLegacyCommit,
} from './commit';
// Common utilities
export { canonText, hashText, sha256 } from './common';
// Conflict Detection (#9)
export {
  type ConflictCandidate,
  type ConflictReport,
  type DetectConflictsOptions,
  detectConflicts,
  type ExistingSentenceWithEmbedding,
} from './conflict';
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
  type ClassifiedCommitDiff,
  type ClassifiedSentencePair,
  type CommitDiff,
  calculateDiffStats,
  classifyDiff,
  createDiffEngine,
  type DiffableSentence,
  type DiffCache,
  type DiffClassification,
  DiffEngine,
  type DiffEngineConfig,
  type DiffResult,
  type DiffSegment,
  type DiffStats,
  DiffType,
  diffCommits,
  diffCommitsWithEmbeddings,
  EQUIVALENT_THRESHOLD,
  hungarian,
  incrementalDiffCommits,
  JACCARD_THRESHOLD,
  jaccard,
  lcs,
  type MatchPair,
  type SegmentDiff,
  type SegmentMatch,
  type SentencePair,
  tokenize,
  tokenizeForMatching,
  type WordDiffSegment,
  wordDiff,
} from './diff';
// Extractors
export {
  type AdaptiveConfig,
  type AdaptiveFeedbackStats,
  type AdaptiveThresholds,
  // Anchor types
  type AnchorCandidate,
  type AnchorSource,
  type AnchorType,
  // Incremental Extraction (LLM pipeline)
  buildAdaptiveSection,
  // LLM Extraction
  buildExtractionPrompt,
  // Frame Extraction (Phase 2)
  buildFrameExtractionPrompt,
  // Incremental Extraction (LLM pipeline)
  buildIncrementalPrompt,
  // Relations
  buildRelationPrompt,
  buildStyleSeed,
  computeAdaptiveConfig,
  computeAdaptiveThresholds,
  createLLMExtractor,
  createMeaningPipeline,
  createRelationExtractor,
  type ExtractedSentence,
  type ExtractionItem,
  ExtractionParseError,
  type FrameDeltaParseResult,
  type FrameExtractionInput,
  type FrameExtractionPromptResult,
  type FrameExtractionResult,
  type FrameExtractionTurn,
  FrameExtractor,
  type FuzzyLocateResult,
  fuzzyLocate,
  type LLMExtractionOptions,
  type LLMExtractionResult,
  LLMExtractor,
  type MeaningAgent,
  MeaningPipeline,
  type OverlapResult,
  type OverlapStatus,
  type PipelineContext,
  type PipelineMode,
  type PipelineOptions,
  type PipelineResult,
  type QualityMetrics,
  AgentRegistry,
  parseExtractionResponse,
  parseFrameDelta,
  parseIncrementalResponse,
  parseRelationResponse,
  RelationExtractor,
  type RelationItem,
  RelationParseError,
  type RouteResult,
  resolveSourceRef,
  routeProposal,
  type Segment,
  type SlotQuotesMap,
  spToSentence,
  type TurnInput,
  type ValidationResult as ExtractionValidationResult,
  type VerifiedProposal,
  type VerifyOptions,
  validateExtractedSentences,
  verifyProposal,
} from './extractors';
// Hash / Merkle Tree (#14)
export {
  buildMerkleTree,
  type MembershipProof,
  type MerkleLeaf,
  type MerkleTree,
  type ProofStep,
  verifyMembership,
} from './hash';
// Knowledge Graph (cross-conversation entity/topic clustering + graph builder)
export {
  buildKnowledgeGraph,
  type ClusterOptions,
  type ClusterResult,
  clusterSentences,
  cosineSimilarity as knowledgeCosineSimilarity,
  extractTopTerms,
  type GraphBuildEdge,
  type GraphBuildInput,
  type GraphBuildNode,
  type GraphBuildOutput,
  type SentenceInput as KnowledgeSentenceInput,
} from './knowledge';
// ═══════════════════════════════════════════════════════════════════════════
// Leaf Module (Generation + Validation)
// @see docs/plans/parallel-dev-guidelines.md
// ═══════════════════════════════════════════════════════════════════════════
export {
  // Types
  type BuildPromptOptions,
  type BuiltPrompt,
  buildCorrectivePrompt,
  // Generation (GEN-1)
  buildLeafPrompt,
  // Constraint Suggestion
  buildRound1Prompt,
  buildRound2Prompt,
  buildRound3Prompt,
  buildSystemPrompt,
  type ConstraintCheckResult,
  type ConstraintSuggestionResult,
  type CorrectivePromptOptions,
  collectLessons,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  // Default templates
  DEFAULT_TEMPLATES,
  formatConstraints,
  type GenerateOptions,
  type GenerateResult,
  GenerationError,
  type GenerationMode,
  generateAssertionId,
  // Generation (GEN-2)
  generateLeafOutput,
  getAllDefaultTemplates,
  getDefaultTemplate,
  getTypeInstructions,
  isGenerationConfigured,
  type LeafTemplate,
  type ModeGenerateOptions,
  type MultiRoundOptions,
  type MultiRoundResult,
  modeGenerate,
  multiRoundGenerate,
  type RoundConfig,
  SEMANTIC_EXCLUDE_THRESHOLD,
  // Constants
  SEMANTIC_REQUIRE_THRESHOLD,
  type SemanticThreshold,
  type StylePreferences,
  type SuggestConstraintsOptions,
  type SuggestedConstraint,
  suggestConstraints,
  suggestionsToConstraints,
  type ValidateOptions,
  type ValidationResult,
  // Validation (VAL-1, VAL-2)
  validateConstraints,
  validateConstraintsExactOnly,
  validateConstraintsSimple,
  validateTemplateSyntax,
} from './leaf';
// LLM Provider (interface)
export {
  type Capability,
  createProviderForModel,
  getAllModels,
  getModelInfo,
  getModelsByProvider,
  type LLMGenerateOptions,
  type LLMGenerateOptionsV2,
  type LLMPrompt,
  type LLMProvider,
  LLMProviderError,
  type LLMResult,
  MODEL_CATALOG,
  type ModelInfo,
  normalizeFrameOutput,
  type ProviderName,
  type StructuredResult,
} from './llm';
// Merge (Two-way and three-way merge for combining commits - Issue #71)
// V4: No constraint handling, prepareMerge accepts DiffableSentence[]
export {
  executeMerge,
  executeThreeWayMerge,
  type FrameMergeInput,
  type FrameMergeSuggestion,
  type Merge2WayResult,
  type MergeCandidate,
  type MergeSimilarPair,
  type MergeSuggestion,
  prepareMerge,
  prepareMergeWithEmbeddings,
  prepareThreeWayMerge,
  suggestFrameMerge,
  suggestMerge,
  type ThreeWayConflict,
  type ThreeWayMergeResult,
} from './merge';
// Multimodal content blocks for turns
export {
  type AudioBlock,
  type ContentBlock,
  type FileBlock,
  type ImageBlock,
  isTextOnly,
  type TextBlock,
  textFromBlocks,
  textToBlocks,
} from './multimodal';
// Provider interfaces and implementations
export {
  AllProvidersFailedError,
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
  createGeminiProvider,
  createGoogleAIEmbeddingProvider,
  // NLP Provider (Google Cloud)
  createGoogleCloudNLPProvider,
  // NLP Provider (Local fallback)
  createLocalNLPProvider,
  createOllamaEmbeddingProvider,
  createOllamaProvider,
  createOpenAIEmbeddingProvider,
  createOpenAIProvider,
  // Provider Registry
  createProviderRegistry,
  DeepSeekProvider,
  type DeepSeekProviderConfig,
  type DependencyLabel,
  // Embedding Provider (interface)
  type EmbeddingProvider,
  EmbeddingProviderError,
  GeminiProvider,
  type GeminiProviderConfig,
  type GoogleAIEmbeddingConfig,
  // Embedding Provider (implementations)
  GoogleAIEmbeddingProvider,
  type GoogleCloudNLPConfig,
  // NLP Provider (implementations)
  GoogleCloudNLPProvider,
  LocalNLPProvider,
  type LocalNLPProviderConfig,
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
  OllamaProvider,
  type OllamaProviderConfig,
  type OpenAIEmbeddingConfig,
  OpenAIEmbeddingProvider,
  OpenAIProvider,
  type OpenAIProviderConfig,
  POS_TAG_MAPPING,
  type ProviderEntry,
  ProviderRegistry,
  type ProviderRole,
  type RegistryConfig,
  type ResolvedConfig,
  type RoleAssignment,
  type TestConnectionResult,
} from './providers';
export type {
  BusinessGateResult,
  BusinessRuleConfig,
  CoverageResult,
  Delta,
  DeltaLogEntry,
  DeltaSource,
  DimensionResult,
  Frame,
  FrameChange,
  FrameDiff,
  FrameMergeDecision,
  FrameMergeResult,
  FrameRelationType,
  GateDimension,
  GateResult,
  InlineFrame,
  MergeResolution,
  Relation,
  SemanticContent,
  SemanticGateResult,
  SemanticIssue,
  SlotConflict,
  SlotDiff,
  SlotRef,
  SlotSourceRef,
  SlotValue,
  StructureGateResult,
  ValidationError as SemanticValidationError,
  ValidationResult as SemanticValidationResult,
  ValidationWarning as SemanticValidationWarning,
  WordDiffFn,
} from './semantic';
// ═══════════════════════════════════════════════════════════════════════════
// Semantic Frame Paradigm (Frame + Relation + Delta + Diff + Merge)
// @see docs/plans/core-engine/00-index.md
// ═══════════════════════════════════════════════════════════════════════════
export {
  applyDelta,
  BusinessGate,
  buildCoveragePrompt,
  buildDraft,
  buildSemanticGatePrompt,
  checkRelationSanity,
  DeltaSchema,
  evaluateRule,
  FRAME_RELATION_TYPES,
  FrameRelationTypeSchema,
  FrameSchema,
  type FrameTextSegment,
  frameDiff,
  framesToNumberedText,
  framesToTextSegments,
  frameToText,
  GateRunner,
  type GateRunnerOptions,
  parseCoverageResponse,
  parseGatesConfig,
  parseSemanticGateResponse,
  executeFrameMerge,
  prepareFrameMerge,
  RelationSchema,
  SemanticContentSchema,
  SemanticGate,
  SlotValueSchema,
  validateIntegrity,
} from './semantic';
// Storage (types + pure utils only)
// For CRUD operations, use @t3x-dev/storage package
export * from './storage';
// ═══════════════════════════════════════════════════════════════════════════
// V4 Architecture Types
// @see docs/specification/semantic-layer-architecture.md
// @see docs/specification/memory-pin-system-design.md
// ═══════════════════════════════════════════════════════════════════════════
export {
  // User (authentication)
  type Account,
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
  type ConstraintSourceFrame,
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
  // Evidence / Extraction (LLM Incremental)
  type EvidenceAnchor,
  type ExcludeConstraint as ExcludeConstraintV4,
  type ExtractionCursor,
  type ExtractionProposal,
  type ExtractionStats,
  // ID Prefixes
  ID_PREFIXES,
  type IncrementalExtractionResult,
  isDeployLeaf,
  isGenerationLeaf,
  LEAF_TYPES,
  type Leaf,
  type LeafConfig,
  // Leaf History
  type LeafHistory,
  type LeafType,
  type LocatedEvidence,
  // Merge summary
  type MergeSummaryData,
  type MergeV4Candidate,
  // Merge V4 types
  type MergeV4Result,
  type MergeV4SimilarPair,
  // Pin (source selection)
  type Pin,
  type PinType,
  type ProjectExtractionConfig,
  RELATION_TYPES,
  type RelationExtractionResult,
  // Ring 4: Relations
  type RelationType,
  type RequireConstraint as RequireConstraintV4,
  type SemanticPoint,
  // Sentence
  type Sentence as SentenceV4,
  type SentenceRelation,
  type SentenceSourceRef,
  type SentenceV5,
  // Share Token
  type ShareToken,
  type User,
  type WordDiffSegment as WordDiffSegmentV4,
} from './types/v4';
