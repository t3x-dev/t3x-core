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
// Incremental Extraction (LLM pipeline)
export { type FuzzyLocateResult, fuzzyLocate } from './fuzzyLocate';
export { parseIncrementalResponse } from './incrementalParser';
export { buildAdaptiveSection, buildIncrementalPrompt, buildStyleSeed } from './incrementalPrompt';
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
// Relation Extraction (Ring 4)
export { createRelationExtractor, RelationExtractor } from './relationExtractor';
export { parseRelationResponse, type RelationItem, RelationParseError } from './relationParser';
export { buildRelationPrompt } from './relationPrompt';
// Ring Extractor
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
