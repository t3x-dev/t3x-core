/**
 * Extractors exports
 */

// Types
export {
  type PosTag,
  type Polarity,
  type FacetType,
  type Keyword,
  type Ring1Output,
  type Facet,
  type Ring2Output,
  type Segment,
  type Ring3Output,
  type RingOutput,
  createEmptyRing1,
  createEmptyRing2,
  createEmptyRing3,
  createEmptyRingOutput,
} from './types';

// Polarity Rules
export {
  type PolarityRule,
  type PreferenceRelation,
  PolarityRuleEngine,
  createPolarityRuleEngine,
} from './polarityRules';

// Ring Extractor
export {
  type ExtractorConfig,
  RingExtractor,
  createRingExtractor,
} from './ringExtractor';
