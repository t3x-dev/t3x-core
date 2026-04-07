/**
 * Extractor Types
 *
 * Shared types used by extractors and downstream consumers.
 */

/**
 * Anchor types for extraction
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
  // Frame extraction anchor types
  | 'verbatim' // Exact quote from source
  | 'paraphrase' // Reworded from source
  | 'inference'; // Inferred from context (cross-turn)

/**
 * Anchor source
 * @see docs/specification/ring-schema.md#anchorsource-enum-v11
 */
export type AnchorSource =
  | 'token' // Derived from NLP token
  | 'entity' // Derived from NLP named entity
  | 'phrase'; // Derived from phrase pattern matching

/**
 * Anchor candidate for UI highlighting.
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
  /** Where this candidate was derived from */
  source: AnchorSource;
}

/**
 * Segment (node-level unit of text)
 * Used by nodeBuilder and diff engine.
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
