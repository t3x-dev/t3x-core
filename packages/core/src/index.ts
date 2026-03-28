/**
 * @t3x-dev/core
 *
 * T3X Core - Deterministic semantic extraction, diff, and merge engine.
 *
 * This package provides:
 * - Tree-primary semantic extraction (TreeNode + Relation)
 * - Semantic diff (two-way)
 * - Two-way merge for combining commits
 * - Provider interfaces (NLP, Embedding, LLM)
 *
 * All operations are deterministic and do not depend on LLMs.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Autopilot (auto-commit evaluator)
// ═══════════════════════════════════════════════════════════════════════════
export {
  type AutoCommitCandidate,
  type AutoCommitPlan,
  type AutopilotConfig,
  DEFAULT_AUTOPILOT_CONFIG,
  evaluateAutoCommit,
  mergeAutopilotConfig,
} from './autopilot';

// ═══════════════════════════════════════════════════════════════════════════
// Commit
// ═══════════════════════════════════════════════════════════════════════════
export {
  type Author,
  COMMIT_SCHEMA,
  type Commit,
  type CommitFirstClass,
  computeCommitHash,
  type Provenance,
} from './commit';

// ═══════════════════════════════════════════════════════════════════════════
// Common utilities
// ═══════════════════════════════════════════════════════════════════════════
export { canonText, hashText, sha256 } from './common';

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

// ═══════════════════════════════════════════════════════════════════════════
// Extractors
// ═══════════════════════════════════════════════════════════════════════════
export {
  type AdaptiveConfig,
  type AdaptiveFeedbackStats,
  type AdaptiveThresholds,
  AgentRegistry,
  // Anchor types
  type AnchorCandidate,
  type AnchorSource,
  type AnchorType,
  // Extraction (Phase 2)
  buildExtractionPrompt,
  // Relations
  buildRelationPrompt,
  computeAdaptiveConfig,
  computeAdaptiveThresholds,
  createMeaningPipeline,
  createRelationExtractor,
  Compressor,
  type DeltaParseResult,
  type ExtractionInput,
  type ExtractionPromptResult,
  type ExtractionResult,
  type ExtractionTurn,
  Extractor,
  type NodeWithSignals,
  type FuzzyLocateResult,
  fuzzyLocate,
  type MeaningAgent,
  MeaningPipeline,
  type PipelineContext,
  type PipelineMode,
  type PipelineOptions,
  type PipelineResult,
  parseDelta,
  parseRelationResponse,
  type QualityMetrics,
  RelationExtractor,
  type RelationItem,
  RelationParseError,
  type Segment,
  type SlotQuotesMap,
} from './extractors';

// Extraction Style Config
export {
  DEFAULT_STYLE,
  type ExtractionStyleConfig,
  type Granularity,
  matchPreset,
  PRESETS,
  type PresetName,
  type QuoteLength,
  type Tier3Behavior,
  type UpdateStance,
} from './extractors/extractionStyleConfig';

// ═══════════════════════════════════════════════════════════════════════════
// Hash / Merkle Tree (#14)
// ═══════════════════════════════════════════════════════════════════════════
export {
  buildMerkleTree,
  type MembershipProof,
  type MerkleLeaf,
  type MerkleTree,
  type ProofStep,
  verifyMembership,
} from './hash';

// ═══════════════════════════════════════════════════════════════════════════
// Leaf Module (Generation + Validation)
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

// ═══════════════════════════════════════════════════════════════════════════
// LLM Provider (interface)
// ═══════════════════════════════════════════════════════════════════════════
export {
  type Capability,
  createProviderForModel,
  getAllModels,
  getModelInfo,
  getModelsByProvider,
  type LLMBasicGenerateOptions,
  type LLMCallLog,
  type LLMCallLogger,
  type LLMGenerateOptions,
  type LLMPrompt,
  type LLMProvider,
  LLMProviderError,
  type LLMResult,
  MODEL_CATALOG,
  type ModelInfo,
  normalizeLLMOutput,
  type ProviderName,
  type StructuredResult,
} from './llm';

// ═══════════════════════════════════════════════════════════════════════════
// Multimodal content blocks for turns
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// Pipeline intelligence layer (8-step orchestrator)
// ═══════════════════════════════════════════════════════════════════════════
export {
  type AdvisoryQuestion,
  type AmbiguityResult,
  type AnswerApplyResult,
  applyAnswer,
  applyStructuralAnswer,
  applyVaguenessAnswer,
  checkDiffCompatibility,
  checkReadiness,
  computeSessionContext,
  type DiffCheckResult,
  type DriftDecision,
  type DriftResult,
  decideAction,
  detectAmbiguity,
  detectDrift,
  type ExtractionCompletedEvent,
  generateCollapseDelta,
  type PipelineDecision,
  PipelineEventEmitter,
  type PipelineEventMap,
  type PipelineOrchestratorContext,
  type PreFilterResult,
  parseAmbiguityResponse,
  parseDriftResponse,
  pipelineEmitter,
  preFilterDrift,
  type QuestionGeneratedEvent,
  type ReadinessBlockReason,
  type ReadinessResult,
  type SessionContext,
  type TopicChangedEvent,
  type UserAnswer,
} from './pipeline';

// ═══════════════════════════════════════════════════════════════════════════
// Provider interfaces and implementations
// ═══════════════════════════════════════════════════════════════════════════
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
  createOllamaEmbeddingProvider,
  createOllamaProvider,
  createOpenAIEmbeddingProvider,
  createOpenAIProvider,
  // Provider Registry
  createProviderRegistry,
  DeepSeekProvider,
  type DeepSeekProviderConfig,
  // Embedding Provider (interface)
  type EmbeddingProvider,
  EmbeddingProviderError,
  GeminiProvider,
  type GeminiProviderConfig,
  type GoogleAIEmbeddingConfig,
  // Embedding Provider (implementations)
  GoogleAIEmbeddingProvider,
  type OllamaEmbeddingConfig,
  OllamaEmbeddingProvider,
  OllamaProvider,
  type OllamaProviderConfig,
  type OpenAIEmbeddingConfig,
  OpenAIEmbeddingProvider,
  OpenAIProvider,
  type OpenAIProviderConfig,
  type ProviderEntry,
  ProviderRegistry,
  type ProviderRole,
  type RegistryConfig,
  type ResolvedConfig,
  type RoleAssignment,
  type TestConnectionResult,
} from './providers';

// ═══════════════════════════════════════════════════════════════════════════
// Semantic Module (Tree-Primary: TreeNode + Relation + Delta + Diff + Merge)
// ═══════════════════════════════════════════════════════════════════════════
export {
  // Delta
  applyDelta,
  // Business Gate
  BusinessGate,
  buildCoveragePrompt,
  buildSemanticGatePrompt,
  buildSlotQuotesPath,
  // Validation
  checkRelationSanity,
  collectSlotQuotes,
  // Schemas
  DeltaSchema,
  // Diff
  diffCommits,
  diffSlots,
  evaluateRule,
  // Merge
  executeMerge,
  flattenTree,
  flattenTrees,
  // Gate
  GateRunner,
  type GateRunnerOptions,
  parseCoverageResponse,
  parseGatesConfig,
  parseSemanticGateResponse,
  prepareMerge,
  // Constants
  RELATION_TYPES,
  RelationSchema,
  RelationTypeSchema,
  resolveSlotQuotesPath,
  SemanticContentSchema,
  SemanticGate,
  // Serialization
  serializeForPrompt,
  SlotValueSchema,
  TreeNodeSchema,
  unflattenToTree,
  unflattenToTrees,
  validateIntegrity,
  validateTreeDepth,
  yamlToTree,
} from './semantic';

// Semantic types (re-exported for convenience)
export type {
  BusinessGateResult,
  BusinessRuleConfig,
  CoverageResult,
  Delta,
  DeltaLogEntry,
  DeltaSource,
  DimensionResult,
  GateDimension,
  GateResult,
  MergeDecision,
  MergeResolution,
  MergeResult,
  Relation,
  SemanticContent,
  SemanticGateResult,
  SemanticIssue,
  SlotConflict,
  SlotDiff,
  SlotValue,
  StructureGateResult,
  TreeChange,
  TreeDiff,
  TreeNode,
  ValidationError as SemanticValidationError,
  ValidationResult as SemanticValidationResult,
  ValidationWarning as SemanticValidationWarning,
  WordDiffFn,
} from './semantic';

// Re-export RelationType from semantic (tree-primary relation types)
export type { RelationType as SemanticRelationType } from './semantic';

// ═══════════════════════════════════════════════════════════════════════════
// YOps — YAML Operations for Knowledge Trees
// ═══════════════════════════════════════════════════════════════════════════
export {
  applyYOps,
  findNode,
  formatYOpsLog,
  getNodeKey,
  getParentPath,
  parseYOpsYaml,
  SNAKE_CASE_KEY,
  YOpSchema,
  YOPS_ERRORS,
  YOpsDocumentSchema,
} from './yops';

export type {
  AddOp,
  CloneOp,
  DropOp,
  FoldOp,
  MergeOp,
  MoveOp,
  NestOp,
  RelateOp,
  RenameOp,
  SetOp,
  SplitOp,
  UnrelateOp,
  UnsetOp,
  YOp,
  YOpsDocument,
  YOpsError,
  YOpsResult,
} from './yops';

// ═══════════════════════════════════════════════════════════════════════════
// Storage (types + pure utils only)
// For CRUD operations, use @t3x-dev/storage package
// ═══════════════════════════════════════════════════════════════════════════
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
  type CommitAuthor,
  type CommitSourceRef,
  // Constraint (now belongs to Leaf)
  type Constraint,
  type ConstraintSourceFrame,
  type ContextSource,
  // Conversation Context
  type ConversationContext,
  // Draft (Workbench)
  type CreateDraftInput,
  type CreateLeafHistoryInput,
  type CreateLeafInput,
  type CreatePinInput,
  DEPLOY_TYPES,
  type DeployType,
  type Draft,
  type DraftConstraint,
  type DraftStatus,
  type ExcludeConstraint,
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
  // Pin (source selection)
  type Pin,
  type PinType,
  // Relation types (tree-node relations)
  RELATION_TYPE_VALUES,
  type RelationExtractionResult,
  type RelationType,
  type RequireConstraint,
  type NodeRelation,
  // Share Token
  type ShareToken,
  type User,
} from './types';
