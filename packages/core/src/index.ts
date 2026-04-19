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
  type CommitSchemaTag,
  computeCommitHash,
  LEGACY_COMMIT_SCHEMAS,
  type Provenance,
} from './commit';
// ═══════════════════════════════════════════════════════════════════════════
// Common utilities
// ═══════════════════════════════════════════════════════════════════════════
export { canonText, hashText, sha256 } from './common';
// ═══════════════════════════════════════════════════════════════════════════
// Context Builder
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
// Emitters (deterministic output generators)
// ═══════════════════════════════════════════════════════════════════════════
export * from './emitters/index';
// ═══════════════════════════════════════════════════════════════════════════
// Extractors
// ═══════════════════════════════════════════════════════════════════════════
export {
  type AdaptiveConfig,
  type AdaptiveFeedbackStats,
  type AdaptiveThresholds,
  // Anchor types
  type AnchorCandidate,
  type AnchorSource,
  type AnchorType,
  // Correction prompt (batch validation feedback loop)
  buildCorrectionPrompt,
  // YOps extraction pipeline
  buildYOpsPrompt,
  Compressor,
  type CorrectionInput,
  type CorrectionPromptResult,
  // Post-extraction transforms (deterministic, replaces MeaningPipeline)
  checkRegression,
  computeAdaptiveConfig,
  computeAdaptiveThresholds,
  consolidate,
  type ExtractionInput,
  type ExtractionPromptResult,
  type ExtractionResult,
  type ExtractionTurn,
  Extractor,
  flagContradictions,
  type NodeWithSignals,
  nest,
  parseYOpsOutput,
  type RegressionWarning,
  runTransforms,
  type Segment,
  type TransformResult,
  type YOpsParseResult,
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
export type { Lesson, LessonSource } from './feedback';
// ═══════════════════════════════════════════════════════════════════════════
// Feedback Module (Lesson generation + collection)
// ═══════════════════════════════════════════════════════════════════════════
export { collectLessonsFromAssertions, generateLesson } from './feedback';
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
  getCanonicalModelId,
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
  normalizeModelId,
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
// Ops (Operation types + runOperation pipeline runner)
// ═══════════════════════════════════════════════════════════════════════════
export type { Operation, OpsPipelineContext, PipelineEvent } from './ops';
export { collectResult, runOperation } from './ops';

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
  generateCollapseYOps,
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
// Semantic types (re-exported for convenience)
// Re-export RelationType from semantic (tree-primary relation types)
export type {
  BusinessGateResult,
  BusinessRuleConfig,
  CoverageResult,
  DimensionResult,
  GateDimension,
  GateResult,
  MergeDecision,
  MergeResolution,
  MergeResult,
  Relation,
  RelationType,
  SemanticContent,
  SemanticGateResult,
  SemanticIssue,
  SlotConflict,
  SlotDiff,
  SlotValue,
  StructureGateResult,
  TreeDiff,
  TreeNode,
  ValidationError as SemanticValidationError,
  ValidationResult as SemanticValidationResult,
  ValidationWarning as SemanticValidationWarning,
  WordDiffFn,
  YOpsLogEntry,
  YOpsSource,
} from './semantic';
// ═══════════════════════════════════════════════════════════════════════════
// Semantic Module (Tree-Primary: TreeNode + Relation + Diff + Merge)
// ═══════════════════════════════════════════════════════════════════════════
export {
  BLOB_TYPES,
  type BlobType,
  // Business Gate
  BusinessGate,
  buildCoveragePrompt,
  buildSemanticGatePrompt,
  // Validation
  checkRelationSanity,
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
  isBlob,
  parseCoverageResponse,
  parseGatesConfig,
  parseSemanticGateResponse,
  prepareMerge,
  // Constants
  RELATION_TYPES,
  RelationSchema,
  RelationTypeSchema,
  SemanticContentSchema,
  SemanticGate,
  SlotValueSchema,
  // Serialization
  serializeForPrompt,
  TreeNodeSchema,
  unflattenToTree,
  unflattenToTrees,
  validateIntegrity,
  validateTreeDepth,
  yamlToTree,
} from './semantic';
// JSON Schema export (Zod v4 native)
export {
  getSemanticContentJsonSchema,
  getTreeNodeJsonSchema,
} from './semantic/jsonSchema';
// ═══════════════════════════════════════════════════════════════════════════
// Storage (types + pure utils only)
// For CRUD operations, use @t3x-dev/storage package
// ═══════════════════════════════════════════════════════════════════════════
export * from './storage';
export type {
  CloneOp,
  DefineOp,
  DropOp,
  FailingOp,
  FailureReason,
  FoldOp,
  HumanSource,
  LLMSource,
  MergeOp,
  MoveOp,
  NestOp,
  PopulateOp,
  RelateOp,
  RenameOp,
  ReplayInput,
  ReplayResult,
  SetOp,
  Source,
  SourcedYOp,
  SplitOp,
  TurnRef,
  UnrelateOp,
  UnsetOp,
  ValidationTurn,
  VerifyResult,
  YOp,
  YOpCategory,
  YOpsDocument,
  YOpsError,
  YOpsResult,
} from './t3x-yops';
// ═══════════════════════════════════════════════════════════════════════════
// YOps — YAML Operations for Knowledge Trees
// ═══════════════════════════════════════════════════════════════════════════
export {
  applySourcedYOps,
  applyYOps,
  classifyYOp,
  extractOpsFromEntries,
  findNode,
  formatYOpsLog,
  getNodeKey,
  getParentPath,
  isHumanSource,
  isLLMSource,
  normalizeOpTurnHashes,
  parseYOpsYaml,
  repairOpQuotes,
  replayYOps,
  SNAKE_CASE_KEY,
  validateSource,
  verifyReplay,
  YOPS_ERRORS,
  YOpSchema,
  YOpsDocumentSchema,
} from './t3x-yops';
export { getYOpsJsonSchema } from './t3x-yops/jsonSchema';
// ═══════════════════════════════════════════════════════════════════════════
// Architecture Types
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
  type ConstraintSourceNode,
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
  // Relation types — re-exported from semantic layer
  RELATION_TYPE_VALUES,
  type RequireConstraint,
  // Share Token
  type ShareToken,
  type User,
} from './types';
export type {
  LintConfig,
  LintResult,
  LintWarning,
  ValidateTreeOptions,
  ValidateTreeResult,
} from './ylint';
// ═══════════════════════════════════════════════════════════════════════════
// YLint — Knowledge Tree Validation
// ═══════════════════════════════════════════════════════════════════════════
export { DEFAULT_LINT_CONFIG, validateTree, ylint } from './ylint';
