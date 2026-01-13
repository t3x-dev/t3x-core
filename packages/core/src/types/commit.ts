/**
 * Commit-related Type Definitions
 *
 * Types for semantic commit structures and sentence-level data.
 */

/**
 * Source reference for a sentence
 * Tracks where the sentence originated from
 */
export interface SentenceSource {
  /** Type of source (e.g., 'conversation', 'turn') */
  type: string;
  /** Source identifier */
  id: string;
}

/**
 * A sentence extracted from a commit
 *
 * Represents a semantic unit with its source reference and confidence score.
 */
export interface Sentence {
  /** Unique sentence ID */
  id: string;
  /** Sentence text content */
  text: string;
  /** Confidence score [0, 1] */
  confidence: number;
  /** Source reference */
  source: SentenceSource;
}
