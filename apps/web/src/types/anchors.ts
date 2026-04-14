/**
 * Anchor types — snake_case API contract shapes.
 *
 * Lives in @/types/ so both @/infrastructure (HTTP edge) and @/domain
 * (pure parsers) can import them without crossing layer bans. The
 * camelCase domain shapes (CommitAnchors / NodeWithAnchors / etc.)
 * live in @/types/nodes.
 */

/** Anchor constraint type (snake_case to match API v1.1 output) */
export type ApiAnchorConstraint = 'must_have' | 'mustnt_have' | 'preferred';

/** Anchor type */
export type ApiAnchorType =
  | 'number'
  | 'money'
  | 'duration'
  | 'percent'
  | 'date'
  | 'entity'
  | 'term'
  | 'phrase'
  // Tree extraction anchor types
  | 'verbatim'
  | 'paraphrase'
  | 'inference';

/** Confirmed anchor (snake_case API format) */
export interface ApiConfirmedAnchor {
  id: string;
  text: string;
  /** Relative position within node (for API storage) */
  start: number;
  /** Relative position within node (for API storage) */
  end: number;
  type: ApiAnchorType;
  constraint: ApiAnchorConstraint;
  /** Optional: Pre-computed global start position (NOT from API, computed in UI layer during parsing) */
  global_start?: number;
  /** Optional: Pre-computed global end position (NOT from API, computed in UI layer during parsing) */
  global_end?: number;
}

/** ContentNode with anchors (snake_case API format) */
export interface ApiNodeWithAnchors {
  node_id: string;
  text: string;
  start_char: number;
  end_char: number;
  anchors: ApiConfirmedAnchor[];
}

/** Commit-level anchor storage (snake_case API format) */
export interface ApiCommitAnchors {
  input_text_hash: string;
  nodes: ApiNodeWithAnchors[];
}

/** Anchor candidate (snake_case API format) — Ring1 extraction output */
export interface ApiAnchorCandidate {
  text: string;
  type: 'number' | 'money' | 'duration' | 'percent' | 'date' | 'entity' | 'term' | 'phrase';
  start_char: number;
  end_char: number;
  source: 'token' | 'entity' | 'phrase';
}
