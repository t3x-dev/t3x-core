/**
 * Extractors exports
 */

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
export {
  createRingExtractor,
  type ExtractorConfig,
  RingExtractor,
} from './ringExtractor';
// Incremental Extraction (LLM pipeline)
export { fuzzyLocate, type FuzzyLocateResult } from './fuzzyLocate';
export { buildIncrementalPrompt, buildStyleSeed } from './incrementalPrompt';
export { parseIncrementalResponse } from './incrementalParser';
export { routeProposal, type RouteResult } from './routeProposal';
export { resolveSourceRef } from './sourceRefResolver';
export { spToSentence } from './spToSentence';
export { verifyProposal, type VerifiedProposal } from './verifyProposal';
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
