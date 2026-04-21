/**
 * Extractors exports
 */

export {
  type AdaptiveConfig,
  type AdaptiveFeedbackStats,
  type AdaptiveThresholds,
  computeAdaptiveConfig,
  computeAdaptiveThresholds,
  type FeedbackStats,
} from './adaptiveThresholds';
// Compression
export {
  type CompressMetadata,
  Compressor,
  type CompressResult,
} from './compressor';
export {
  buildCompressPrompt,
  type CompressInput,
  type NodeWithSignals,
} from './compressPrompt';
// Correction prompt (batch validation feedback loop)
export {
  buildCorrectionPrompt,
  type CorrectionInput,
  type CorrectionPromptResult,
} from './correctionPrompt';
// extractionPrompt helpers — still used by yopsPrompt.ts internally
export {
  type ExtractionPromptResult,
  granularitySegment,
  quoteLengthSegment,
  tier3Segment,
  updateStanceSegment,
} from './extractionPrompt';
// Extraction
export {
  type ExtractionInput,
  type ExtractionResult,
  type ExtractionTurn,
  Extractor,
} from './extractor';
// Extraction Strategies
export {
  type ExtractionStrategy,
  YamlExtractionStrategy,
} from './strategies';
// Post-extraction transforms (deterministic, replaces MeaningPipeline)
export {
  checkRegression,
  consolidate,
  flagContradictions,
  nest,
  type RegressionWarning,
  runTransforms,
  type TransformResult,
} from './transforms';
// Types
export type {
  AnchorCandidate,
  AnchorSource,
  AnchorType,
  Segment,
} from './types';
export {
  compileExtractionDraft,
  toCompiledMutationPlan,
  type CompileResult,
} from './v2/compiler';
export {
  extractAndApply,
  type ExtractAndApplyInput,
  type ExtractAndApplyResult,
} from './v2/extract-and-apply';
export {
  createExtractionFailure,
  EXTRACTION_FAILURE_CODES,
  getRetryStrategy,
  isRetryableFailure,
  type ExtractionFailure,
  type ExtractionFailureCode,
  type RetryDecision,
  type RetryStrategy,
} from './v2/failures';
export {
  buildPromptTurnMap,
  normalizeExtractionText,
  type PromptTurn,
  type PromptTurnInput,
} from './v2/normalization';
export {
  buildOpenAIChatCompletionBody,
  mapProviderErrorToExtractionFailure,
  normalizeProviderDraftText,
  type OpenAIChatCompletionBodyInput,
  type OpenAIChatMessage,
} from './v2/providerAdapters';
export {
  liftProviderDraftToExtractionDraft,
  ProviderDraftCandidateSchema,
  ProviderDraftEvidenceSchema,
  ProviderDraftTargetRefSchema,
  ProviderExtractionDraftItemSchema,
  ProviderExtractionDraftSchema,
  PROVIDER_EXTRACTION_DRAFT_SCHEMA,
  type ProviderExtractionDraft,
} from './v2/providerDraft';
export {
  runExtractionV2Pipeline,
  type ExtractionV2PipelineInput,
  type ExtractionV2PipelineResult,
} from './v2/pipeline';
export {
  EXTRACTION_DRAFT_SCHEMA,
  EXTRACTION_MODES,
  DraftEvidenceSchema,
  DraftIntentSchema,
  EvidenceRoleSchema,
  ExtractionDraftItemSchema,
  ExtractionDraftSchema,
  ExtractionModeSchema,
  ReasoningTypeSchema,
  TurnTagSchema,
  type CompileInput,
  type CompiledMutationPlan,
  type DraftEvidence,
  type DraftIntent,
  type ExtractionDraft,
  type ExtractionDraftItem,
  type ExtractionMode,
  type ReasoningType,
} from './v2/types';
// YOps Parser
export { parseYOpsOutput, type YOpsParseResult } from './yopsParser';
// YOps Prompt Builder (YAML operations format for incremental extraction)
export { buildYOpsPrompt } from './yopsPrompt';
