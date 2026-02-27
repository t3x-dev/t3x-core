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
export { resolveSourceRef } from './sourceRefResolver';
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
