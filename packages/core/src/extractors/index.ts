/**
 * Extractors exports
 *
 * Legacy Extractor / Compressor / runTransforms were retired in favor of the
 * deterministic v2 pipeline. What remains:
 *  - extractionStyleConfig: style presets consumed by webui + mcp
 *  - compressPrompt: prompt builder consumed by v2/compress
 *  - types: shared anchor / segment types used by v2 + consumers
 *  - v2/: the current extraction + compression pipeline
 */

export {
  buildCompressPrompt,
  type CompressInput,
  type NodeWithSignals,
} from './compressPrompt';
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
  type CompressionV2Metadata,
  type CompressionV2PipelineInput,
  type CompressionV2Result,
  type CompressionV2Usage,
  runCompressionV2Pipeline,
} from './v2/compress';
export {
  type ExtractAndApplyInput,
  type ExtractAndApplyResult,
  extractAndApply,
} from './v2/extract-and-apply';
export {
  type DegradationStage,
  type ExtractionDegradation,
  extractAndApplyResilient,
  type ResilientExtractAndApplyResult,
} from './v2/extract-and-apply-resilient';
export { type ExtractToOutcomeInput, extractToOutcome } from './v2/extractToOutcome';
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
  canonicalizeMultiValueScalar,
  canonicalizeMultiValueScalarsInRecord,
  canonicalizeYOp,
  canonicalizeYOps,
  normalizeExtractionText,
  type PromptTurn,
  type PromptTurnInput,
} from './v2/normalization';
export {
  type DroppedExtractionItem,
  type ExtractionOutcome,
  type ExtractionWarning,
  type FailureDetails,
  isPartialCompileWarning,
  PARTIAL_COMPILE_SALVAGE_PREFIX,
} from './v2/outcome';
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
