/**
 * Deterministic source validator for T3X YOps.
 *
 * Contract: every op must carry Source.
 *  - LLMSource: turn_ref.turn_hash must exist in provided turns; turn_ref.quote
 *    must be a verbatim (case-sensitive) substring of that turn's content.
 *  - HumanSource: author must be non-empty.
 *
 * NO fuzzy matching. NO synthesis. A failure here means the LLM must retry.
 */

import { isHumanSource, isLLMSource, type Source } from './source';
import type { SourcedYOp } from './types';

export interface ValidationTurn {
  turn_hash: string;
  content: string;
}

export type FailureReason =
  | 'missing_source'
  | 'invalid_source_type'
  | 'unknown_turn_hash'
  | 'unverifiable_quote'
  | 'missing_author';

export interface FailingOp {
  op: SourcedYOp;
  opIndex: number;
  reason: FailureReason;
  detail?: string;
}

export interface ValidationResult {
  ok: boolean;
  failingOps: FailingOp[];
}

/**
 * Returns the raw source object if it exists and is an object — without
 * filtering by type. Type discrimination happens in validateSource so that
 * unrecognized types hit `invalid_source_type` rather than `missing_source`.
 */
function getSource(op: unknown): unknown {
  if (!op || typeof op !== 'object') return undefined;
  const maybe = (op as { source?: unknown }).source;
  if (!maybe || typeof maybe !== 'object') return undefined;
  return maybe;
}

export function validateSource(
  ops: readonly SourcedYOp[],
  turns: readonly ValidationTurn[]
): ValidationResult {
  const turnMap = new Map(turns.map((t) => [t.turn_hash, t.content]));
  const failing: FailingOp[] = [];

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const src = getSource(op);

    if (src === undefined) {
      failing.push({ op, opIndex: i, reason: 'missing_source' });
      continue;
    }

    // Cast to Source for the type guards — the guards themselves check `.type`,
    // so an unrecognized type safely falls through to the `else` branch below.
    const typedSrc = src as Source;

    if (isLLMSource(typedSrc)) {
      const content = turnMap.get(typedSrc.turn_ref.turn_hash);
      if (content === undefined) {
        failing.push({
          op,
          opIndex: i,
          reason: 'unknown_turn_hash',
          detail: `turn_hash ${typedSrc.turn_ref.turn_hash} not in provided turns`,
        });
        continue;
      }
      const quote = typedSrc.turn_ref.quote;
      if (!quote || !content.includes(quote)) {
        failing.push({
          op,
          opIndex: i,
          reason: 'unverifiable_quote',
          detail: `quote "${quote}" is not a verbatim substring of turn ${typedSrc.turn_ref.turn_hash}`,
        });
      }
    } else if (isHumanSource(typedSrc)) {
      if (!typedSrc.author || typedSrc.author.trim() === '') {
        failing.push({ op, opIndex: i, reason: 'missing_author' });
      }
    } else {
      failing.push({ op, opIndex: i, reason: 'invalid_source_type' });
    }
  }

  return { ok: failing.length === 0, failingOps: failing };
}
