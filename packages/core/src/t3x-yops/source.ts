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

export interface HumanSource {
  type: 'human';
  /** Username from session */
  author: string;
  /** ISO-8601 timestamp */
  at: string;
}

export type Source = LLMSource | HumanSource;

export function isLLMSource(s: Source): s is LLMSource {
  return s.type === 'llm';
}

export function isHumanSource(s: Source): s is HumanSource {
  return s.type === 'human';
}
