/**
 * CommitV3 Types
 *
 * Defines the schema for CommitV3 with explicit separation between
 * first-class (hashed) and second-class (non-hashed) fields.
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
 * A sentence extracted from a turn, with source provenance.
 *
 * Note: confidence scores are stored in the extraction layer (turns.rings_json),
 * not in the commit object, because:
 * - Same sentence has same semantic meaning regardless of extraction confidence
 * - NLP model changes shouldn't affect commit hash
 * - Users confirm content, not confidence scores
 */
export interface Sentence {
  id: string;
  text: string;
  source: {
    turn_hash: string;
    start_char: number;
    end_char: number;
  };
}

/**
 * A constraint requiring a specific value to be present.
 */
export interface RequireConstraint {
  type: 'require';
  id: string;
  value: string;
  match: 'exact' | 'semantic';
  source_sentence_id?: string;
  suggested?: boolean;
}

/**
 * A constraint excluding a specific value.
 */
export interface ExcludeConstraint {
  type: 'exclude';
  id: string;
  value: string;
  match: 'exact' | 'semantic';
  reason?: string;
}

/**
 * Union type for all constraint types.
 */
export type Constraint = RequireConstraint | ExcludeConstraint;

/**
 * The semantic content of a commit.
 */
export interface CommitContent {
  sentences: Sentence[];
  constraints?: Constraint[];
}

/**
 * Author information for a commit.
 */
export interface CommitAuthor {
  name: string;
  identity?: string;
  verification?: 'none' | 'device' | 'verified';
}

/**
 * CommitV3 schema with explicit first-class and second-class field separation.
 *
 * First-class fields (included in hash):
 * - schema, parents, author, committed_at, content
 *
 * Second-class fields (excluded from hash):
 * - project_id, message, branch
 *
 * Note: Canvas position (x/y) is managed by the UI layer (canvasStore),
 * not stored in the commit object.
 */
export interface CommitV3 {
  // ═══════════════════════════════════════════════════════════════════════════
  // First-class fields (included in hash computation)
  // ═══════════════════════════════════════════════════════════════════════════

  /** The computed hash of this commit */
  hash: string;

  /** Schema identifier for versioning */
  schema: 'commit/v3';

  /** Parent commit hashes (empty array for root commits) */
  parents: string[];

  /** Author information */
  author: CommitAuthor;

  /** ISO8601 timestamp when the commit was created */
  committed_at: string;

  /** The semantic content of this commit */
  content: CommitContent;

  // ═══════════════════════════════════════════════════════════════════════════
  // Second-class fields (excluded from hash computation)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Project this commit belongs to (not hashed) */
  project_id?: string;

  /** Human-readable commit message (not hashed) */
  message?: string;

  /** Branch name (not hashed) */
  branch?: string;
}
