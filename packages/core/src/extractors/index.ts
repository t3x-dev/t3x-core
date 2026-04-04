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
export { type ConfidenceInput, computeConfidence } from './confidence';
// Correction prompt (batch validation feedback loop)
export { buildCorrectionPrompt, type CorrectionInput, type CorrectionPromptResult } from './correctionPrompt';
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
export { type FuzzyLocateResult, fuzzyLocate } from './fuzzyLocate';
// Relation Extraction (Inter-node Relations)
export { createRelationExtractor, RelationExtractor } from './relationExtractor';
export { parseRelationResponse, type RelationItem, RelationParseError } from './relationParser';
export { buildRelationPrompt } from './relationPrompt';
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
// YOps Parser
export { parseYOpsOutput, type YOpsParseResult } from './yopsParser';
// YOps Prompt Builder (YAML operations format for incremental extraction)
export { buildYOpsPrompt } from './yopsPrompt';
