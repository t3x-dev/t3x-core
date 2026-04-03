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
export {
  contradictionCheckerAgent,
  coverageCheckerAgent,
  dedupCheckerAgent,
  fuzzyQuoteValidatorAgent,
  nesterAgent,
  topicNamerAgent,
} from './agents';
// Benchmark
export { type BenchmarkComparison, type BenchmarkResult, runBenchmark } from './benchmark';
// Compression
export {
  type CompressMetadata,
  Compressor,
  type CompressResult,
} from './compressor';
// Compression
export {
  buildCompressPrompt,
  type CompressInput,
  type NodeWithSignals,
} from './compressPrompt';
export { type ConfidenceInput, computeConfidence } from './confidence';
export { createMeaningPipeline } from './createMeaningPipeline';
// extractionPrompt helpers — still used by yopsPrompt.ts internally
export {
  type ExtractionPromptResult,
  granularitySegment,
  quoteLengthSegment,
  tier3Segment,
  updateStanceSegment,
} from './extractionPrompt';
// Extraction (Phase 2)
export {
  type ExtractionInput,
  type ExtractionResult,
  type ExtractionTurn,
  Extractor,
} from './extractor';
// Meaning Pipeline (multi-agent orchestration)
export { type FuzzyLocateResult, fuzzyLocate } from './fuzzyLocate';
export {
  AgentRegistry,
  type MeaningAgent,
  MeaningPipeline,
  type PipelineContext,
  type PipelineMode,
  type PipelineOptions,
  type PipelineResult,
  type QualityMetrics,
} from './meaningPipeline';
// Relation Extraction (Inter-node Relations)
export { createRelationExtractor, RelationExtractor } from './relationExtractor';
export { parseRelationResponse, type RelationItem, RelationParseError } from './relationParser';
export { buildRelationPrompt } from './relationPrompt';
// Extraction Strategies
export {
  type ExtractionStrategy,
  ToolUseExtractionStrategy,
  toolCallToYOp,
  YamlExtractionStrategy,
  yopToolDefinitions,
} from './strategies';
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
