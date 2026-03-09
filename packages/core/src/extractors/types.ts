/**
 * Ring Data Types
 *
 * TypeScript interfaces that STRICTLY match docs/specification/ring-schema.md
 * DO NOT add fields not defined in the specification.
 *
 * @deprecated Ring extraction is being retired in favor of Frame semantic engine.
 * New code should use Frame types from `@t3x/core/types/frame`.
 * Existing consumers should migrate to Frame-first with Ring fallback.
 *
 * @see docs/specification/ring-schema.md
 * @see docs/plans/2026-03-09-ring-retirement-migration.md
 */

/**
 * Part-of-speech tags (Universal Dependencies)
 * @deprecated Use Frame semantic engine instead of Ring extraction.
 */
export type PosTag =
  | 'NOUN'
  | 'VERB'
  | 'ADJ'
  | 'ADV'
  | 'PROPN'
  | 'ADP'
  | 'DET'
  | 'PRON'
  | 'NUM'
  | 'PUNCT'
  | 'SYM'
  | 'CCONJ'
  | 'PART'
  | 'X';

/**
 * Polarity values
 * @deprecated Use Frame semantic engine instead of Ring extraction.
 */
export type Polarity = -1 | 0 | 1;

/**
 * Facet types for Ring 2
 * @deprecated Use Frame semantic engine instead of Ring extraction.
 */
export type FacetType = 'intent_seed' | 'time_window' | 'preference_soft' | 'unknown_slot';

/**
 * Anchor types for Ring 1 v1.1
 * @see docs/specification/ring-schema.md#anchortype-enum-v11
 */
export type AnchorType =
  | 'number' // Numeric value: 123, 5.5
  | 'money' // Currency amount: $5000, 100 USD
  | 'duration' // Time duration: 30 days, 2 months
  | 'percent' // Percentage: 15%, 3.5%
  | 'date' // Date expression: January 2025
  | 'entity' // Named entity from NLP: Bangkok, Party A
  | 'term' // Domain-specific term: indemnify, terminate
  // CommitV4 / Frame extraction anchor types
  | 'verbatim' // Exact quote from source
  | 'paraphrase' // Reworded from source
  | 'inference'; // Inferred from context (cross-turn)

/**
 * Anchor source for Ring 1 v1.1
 * @see docs/specification/ring-schema.md#anchorsource-enum-v11
 */
export type AnchorSource =
  | 'token' // Derived from NLP token
  | 'entity' // Derived from NLP named entity
  | 'phrase'; // Derived from phrase pattern matching

/**
 * Anchor candidate for Ring 1 v1.1
 * Unlike keywords (deduplicated by lemma), anchor candidates preserve exact positions.
 *
 * @see docs/specification/ring-schema.md#anchorcandidate-v11
 */
export interface AnchorCandidate {
  /** The candidate text (e.g., "$5000", "30 days", "Bangkok") */
  text: string;
  /** Semantic type of the anchor */
  type: AnchorType;
  /** Start character offset in original input text */
  startChar: number;
  /** End character offset in original input text */
  endChar: number;
  /** Confidence/salience score [0, 1] */
  confidence: number;
  /** Where this candidate was derived from */
  source: AnchorSource;
}

/**
 * Keyword extracted in Ring 1
 * @deprecated Use Frame semantic engine instead of Ring extraction.
 * @see docs/specification/ring-schema.md#keyword
 */
export interface Keyword {
  /** Original text */
  text: string;
  /** Lemmatized form (e.g., traveling → travel) */
  lemma: string;
  /** Polarity: -1=negative, 0=neutral, 1=positive */
  polarity: Polarity;
  /** Part-of-speech tag (Universal Dependencies) */
  pos: PosTag | string;
  /** Named entity type (PERSON, GPE, DATE, etc.), null if not an entity */
  entityType: string | null;
  /** Confidence score [0, 1], defaults to 1.0 */
  confidence: number;
}

/**
 * Ring 1 Output - Keyword Axis
 * @deprecated Use Frame semantic engine instead of Ring extraction.
 * @see docs/specification/ring-schema.md#ring1output---keyword-axis
 */
export interface Ring1Output {
  /** Extracted keywords list */
  keywords: Keyword[];
  /** Time anchor (e.g., "November 2025") */
  timeAnchor: string | null;
  /** Topic label */
  topic: string | null;
  /** Auto-filtered keywords where polarity != 0 */
  preferenceKeywords: Keyword[];
  /** v1.1: Anchor candidates for UI highlighting (numbers, dates, entities, phrases) */
  anchorCandidates?: AnchorCandidate[];
  /** v1.1: SHA-256 hash of input text for offset consistency verification */
  inputTextHash?: string;
}

/**
 * Facet in Ring 2
 * @deprecated Use Frame semantic engine instead of Ring extraction.
 * @see docs/specification/ring-schema.md#facet
 */
export interface Facet {
  /** Type of facet */
  facetType: FacetType;
  /** Facet key/label */
  key: string;
  /** Facet value */
  value: unknown;
  /** Confidence score [0, 1], defaults to 1.0 */
  confidence: number;
}

/**
 * Ring 2 Output - Facets
 * @deprecated Use Frame semantic engine instead of Ring extraction.
 * @see docs/specification/ring-schema.md#ring2output---facets
 */
export interface Ring2Output {
  /** List of extracted facets */
  facets: Facet[];
}

/**
 * Segment in Ring 3
 * @deprecated Use Frame semantic engine instead of Ring extraction.
 * @see docs/specification/ring-schema.md#segment
 */
export interface Segment {
  /** Unique segment ID (e.g., "s-1", "s-2") */
  segmentId: string;
  /** Segment text content */
  text: string;
  /** Start character offset */
  startChar: number;
  /** End character offset */
  endChar: number;
}

/**
 * Ring 3 Output - Sentence Structure
 * @deprecated Use Frame semantic engine instead of Ring extraction.
 * @see docs/specification/ring-schema.md#ring3output---sentence-structure
 */
export interface Ring3Output {
  /** List of sentence segments */
  segments: Segment[];
}

/**
 * Complete Ring Output
 * @deprecated Use Frame semantic engine instead of Ring extraction.
 * @see docs/specification/ring-schema.md#ringoutput-root
 */
export interface RingOutput {
  /** Unique identifier of the turn */
  turnId: string;
  /** Ring 1: Keyword axis */
  ring1: Ring1Output;
  /** Ring 2: Facets */
  ring2: Ring2Output;
  /** Ring 3: Sentence structure */
  ring3: Ring3Output;
}

/**
 * Create an empty Ring 1 output
 * @deprecated Use Frame semantic engine instead of Ring extraction.
 */
export function createEmptyRing1(): Ring1Output {
  return {
    keywords: [],
    timeAnchor: null,
    topic: null,
    preferenceKeywords: [],
  };
}

/**
 * Create an empty Ring 2 output
 * @deprecated Use Frame semantic engine instead of Ring extraction.
 */
export function createEmptyRing2(): Ring2Output {
  return {
    facets: [],
  };
}

/**
 * Create an empty Ring 3 output
 * @deprecated Use Frame semantic engine instead of Ring extraction.
 */
export function createEmptyRing3(): Ring3Output {
  return {
    segments: [],
  };
}

/**
 * Create an empty Ring output
 * @deprecated Use Frame semantic engine instead of Ring extraction.
 */
export function createEmptyRingOutput(turnId: string): RingOutput {
  return {
    turnId,
    ring1: createEmptyRing1(),
    ring2: createEmptyRing2(),
    ring3: createEmptyRing3(),
  };
}
