/**
 * Extractors exports
 */

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
// Types
export {
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
