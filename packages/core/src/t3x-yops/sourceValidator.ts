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

/**
 * LLMs see truncated turn hashes in the prompt (e.g. `sha256:5` from
 * `.slice(0,8)`) and parrot them back. This function resolves truncated
 * hashes to their full counterparts via unique-prefix matching, mutating
 * ops in place. Ambiguous prefixes (matching multiple turns) are left
 * untouched so they fail validation normally.
 */
export function normalizeOpTurnHashes(ops: SourcedYOp[], turns: readonly ValidationTurn[]): void {
  const fullHashes = turns.map((t) => t.turn_hash);
  for (const op of ops) {
    const src = (op as { source?: { type?: string; turn_ref?: { turn_hash?: string } } }).source;
    if (!src || src.type !== 'llm' || !src.turn_ref?.turn_hash) continue;
    const h = src.turn_ref.turn_hash;
    if (fullHashes.includes(h)) continue;
    const matches = fullHashes.filter((f) => f.startsWith(h));
    if (matches.length === 1) {
      src.turn_ref.turn_hash = matches[0];
    }
  }
}

/**
 * LLMs often produce quotes that are close but not verbatim substrings of
 * the turn content (extra whitespace, markdown artifacts, slight rewording).
 * This function attempts deterministic repair:
 *  1. Try the quote as-is (already valid → skip)
 *  2. Strip markdown bold/italic markers and retry
 *  3. Fall back to the op's slot value if it appears verbatim in the turn
 *
 * Mutates ops in place. Quotes that can't be repaired are left untouched
 * so they fail validation normally.
 */
export function repairOpQuotes(ops: SourcedYOp[], turns: readonly ValidationTurn[]): void {
  const turnMap = new Map(turns.map((t) => [t.turn_hash, t.content]));
  for (const op of ops) {
    const src = (
      op as { source?: { type?: string; turn_ref?: { turn_hash?: string; quote?: string } } }
    ).source;
    if (!src || src.type !== 'llm' || !src.turn_ref?.turn_hash) continue;
    const content = turnMap.get(src.turn_ref.turn_hash);
    if (!content) continue;
    const quote = src.turn_ref.quote;
    if (quote && content.includes(quote)) continue;

    // Strategy 1: strip markdown bold/italic
    if (quote) {
      const stripped = quote.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
      if (stripped !== quote && content.includes(stripped)) {
        src.turn_ref.quote = stripped;
        continue;
      }
    }

    // Strategy 2: use the op's slot value as quote
    const opObj = op as Record<string, unknown>;
    const setVal =
      (opObj.set as { value?: string })?.value ??
      (opObj.populate as { values?: Record<string, string> })?.values;
    if (typeof setVal === 'string' && setVal.length >= 4 && content.includes(setVal)) {
      src.turn_ref.quote = setVal;
      continue;
    }

    // Strategy 3: for define ops, use the path's last segment as a keyword search
    const definePath = (opObj.define as { path?: string })?.path;
    if (definePath && !quote) {
      const keyword = definePath.split('/').pop()?.replace(/_/g, ' ');
      if (keyword && keyword.length >= 3 && content.toLowerCase().includes(keyword.toLowerCase())) {
        const idx = content.toLowerCase().indexOf(keyword.toLowerCase());
        src.turn_ref.quote = content.slice(idx, idx + keyword.length);
      }
    }
  }
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
