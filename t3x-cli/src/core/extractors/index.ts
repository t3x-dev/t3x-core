/**
 * Extractors
 *
 * Re-exports all extractor types and implementations from @t3x/core.
 */

export {
  // Types
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
  // Polarity Rules
  type PolarityRule,
  type PreferenceRelation,
  PolarityRuleEngine,
  createPolarityRuleEngine,
  // Ring Extractor
  type ExtractorConfig,
  RingExtractor,
  createRingExtractor,
} from "@t3x/core";
