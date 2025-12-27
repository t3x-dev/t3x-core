/**
 * Ring Data Types
 *
 * TypeScript interfaces that STRICTLY match docs/specification/ring-schema.md
 * DO NOT add fields not defined in the specification.
 *
 * @see docs/specification/ring-schema.md
 */
/**
 * Part-of-speech tags (Universal Dependencies)
 */
export type PosTag = 'NOUN' | 'VERB' | 'ADJ' | 'ADV' | 'PROPN' | 'ADP' | 'DET' | 'PRON' | 'NUM' | 'PUNCT' | 'SYM' | 'CCONJ' | 'PART' | 'X';
/**
 * Polarity values
 */
export type Polarity = -1 | 0 | 1;
/**
 * Facet types for Ring 2
 */
export type FacetType = 'intent_seed' | 'time_window' | 'preference_soft' | 'unknown_slot';
/**
 * Keyword extracted in Ring 1
 *
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
 *
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
}
/**
 * Facet in Ring 2
 *
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
 *
 * @see docs/specification/ring-schema.md#ring2output---facets
 */
export interface Ring2Output {
    /** List of extracted facets */
    facets: Facet[];
}
/**
 * Segment in Ring 3
 *
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
 *
 * @see docs/specification/ring-schema.md#ring3output---sentence-structure
 */
export interface Ring3Output {
    /** List of sentence segments */
    segments: Segment[];
}
/**
 * Complete Ring Output
 *
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
 */
export declare function createEmptyRing1(): Ring1Output;
/**
 * Create an empty Ring 2 output
 */
export declare function createEmptyRing2(): Ring2Output;
/**
 * Create an empty Ring 3 output
 */
export declare function createEmptyRing3(): Ring3Output;
/**
 * Create an empty Ring output
 */
export declare function createEmptyRingOutput(turnId: string): RingOutput;
//# sourceMappingURL=types.d.ts.map