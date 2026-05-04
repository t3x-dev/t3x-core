/**
 * Provenance types for T3X YOps dialect.
 * Every op MUST carry Source — enforced by validator + engine.
 */

export interface TurnRef {
  /** SHA-256 hash of the conversation turn this op derives from */
  turn_hash: string;
  /** Verbatim substring of the turn content */
  quote: string;
  /** Optional precise character range in turn content */
  start_char?: number;
  end_char?: number;
}

export interface LLMSource {
  type: 'llm';
  /** Model identifier, e.g., "claude-sonnet-4-6" */
  model: string;
  /** ISO-8601 timestamp */
  at: string;
  /** Which conversation turn this op derives from */
  turn_ref: TurnRef;
}

/**
 * Where a human edit originated. The Ops surface is the user-facing
 * entry point — distinct from `author` (who) and `at` (when).
 *
 *   - 'tree'   → click/drag/edit on the canvas (gold-edit path)
 *   - 'script' → typed in the Raw YAML editor
 *   - 'inline' → reserved for inline-text edit (not yet wired)
 *
 * Forward-only: existing rows without `surface` render without a "via"
 * suffix in the Ops card. Do not infer surface from `author`.
 */
export type HumanEditSurface = 'tree' | 'script' | 'inline';

export interface HumanSource {
  type: 'human';
  /** Username from session */
  author: string;
  /** ISO-8601 timestamp */
  at: string;
  /**
   * Optional UI surface that produced the edit. Decouples "who" (`author`)
   * from "where" (`surface`). Old rows without it just don't render the
   * "via X" suffix.
   */
  surface?: HumanEditSurface;
}

export type Source = LLMSource | HumanSource;

export function isLLMSource(s: Source): s is LLMSource {
  return s.type === 'llm';
}

export function isHumanSource(s: Source): s is HumanSource {
  return s.type === 'human';
}
