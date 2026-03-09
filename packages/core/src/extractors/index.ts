/**
 * Extractors exports
 */

export {
  type AdaptiveThresholds,
  computeAdaptiveThresholds,
  type FeedbackStats,
} from './adaptiveThresholds';
export {
  type ExtractionItem,
  ExtractionParseError,
  parseExtractionResponse,
} from './extractionParser';
// LLM Extraction
export {
  buildExtractionPrompt,
  type LLMExtractionOptions,
  type TurnInput,
} from './extractionPrompt';
export {
  type ValidationResult,
  validateExtractedSentences,
} from './extractionValidator';
export { type ParseResult as FrameDeltaParseResult, parseFrameDelta } from './frameDeltaParser';
export {
  buildFrameExtractionPrompt,
  type FrameExtractionPromptResult,
} from './frameExtractionPrompt';
// Frame Extraction (Phase 2)
export {
  type FrameExtractionInput,
  type FrameExtractionResult,
  type FrameExtractionTurn,
  FrameExtractor,
} from './frameExtractor';
// Incremental Extraction (LLM pipeline)
export { type FuzzyLocateResult, fuzzyLocate } from './fuzzyLocate';
export { parseIncrementalResponse } from './incrementalParser';
export { buildIncrementalPrompt, buildStyleSeed } from './incrementalPrompt';
export {
  createLLMExtractor,
  type ExtractedSentence,
  type LLMExtractionResult,
  LLMExtractor,
} from './llmExtractor';
// Polarity Rules
export {
  createPolarityRuleEngine,
  type PolarityRule,
  PolarityRuleEngine,
  type PreferenceRelation,
} from './polarityRules';
// Ring Extractor
/** @deprecated Use Frame semantic engine instead of Ring extraction. */
export {
  createRingExtractor,
  type ExtractorConfig,
  RingExtractor,
} from './ringExtractor';
export { type RouteResult, routeProposal } from './routeProposal';
export { resolveSourceRef } from './sourceRefResolver';
export { spToSentence } from './spToSentence';
// Types
export {
  // v1.1: Anchor types
  type AnchorCandidate,
  type AnchorSource,
  type AnchorType,
  createEmptyRing1,
  createEmptyRing2,
  createEmptyRing3,
  createEmptyRingOutput,
  type Facet,
  type FacetType,
  type Keyword,
  type Polarity,
  type PosTag,
  type Ring1Output,
  type Ring2Output,
  type Ring3Output,
  type RingOutput,
  type Segment,
} from './types';
export {
  type OverlapResult,
  type OverlapStatus,
  type VerifiedProposal,
  type VerifyOptions,
  verifyProposal,
} from './verifyProposal';
