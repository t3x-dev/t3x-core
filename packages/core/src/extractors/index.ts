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
  type CompileResult,
  compileExtractionDraft,
  toCompiledMutationPlan,
} from './v2/compiler';
export {
  createExtractionFailure,
  EXTRACTION_FAILURE_CODES,
  type ExtractionFailure,
  type ExtractionFailureCode,
  getRetryStrategy,
  isRetryableFailure,
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
  type ExtractionV2PipelineInput,
  type ExtractionV2PipelineResult,
  runExtractionV2Pipeline,
} from './v2/pipeline';
export {
  buildOpenAIChatCompletionBody,
  mapProviderErrorToExtractionFailure,
  normalizeProviderDraftText,
  type OpenAIChatCompletionBodyInput,
  type OpenAIChatMessage,
} from './v2/providerAdapters';
export {
  liftProviderDraftToExtractionDraft,
  PROVIDER_EXTRACTION_DRAFT_SCHEMA,
  ProviderDraftCandidateSchema,
  ProviderDraftEvidenceSchema,
  ProviderDraftTargetRefSchema,
  type ProviderExtractionDraft,
  ProviderExtractionDraftItemSchema,
  ProviderExtractionDraftSchema,
} from './v2/providerDraft';
export {
  type CompiledMutationPlan,
  type CompileInput,
  type DraftEvidence,
  DraftEvidenceSchema,
  type DraftIntent,
  DraftIntentSchema,
  EvidenceRoleSchema,
  EXTRACTION_DRAFT_SCHEMA,
  EXTRACTION_MODES,
  type ExtractionDraft,
  type ExtractionDraftItem,
  ExtractionDraftItemSchema,
  ExtractionDraftSchema,
  type ExtractionMode,
  ExtractionModeSchema,
  type ReasoningType,
  ReasoningTypeSchema,
  TurnTagSchema,
} from './v2/types';
// YOps Parser
export { parseYOpsOutput, type YOpsParseResult } from './yopsParser';
// YOps Prompt Builder (YAML operations format for incremental extraction)
export { buildYOpsPrompt } from './yopsPrompt';
