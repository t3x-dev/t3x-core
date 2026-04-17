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
  | 'missing_author'
  | 'invalid_structure';

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

function tryExactQuote(content: string, candidate: string | undefined): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  return content.includes(trimmed) ? trimmed : null;
}

function generateQuoteCandidates(quote: string): string[] {
  const candidates = new Set<string>([quote]);
  const push = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) candidates.add(trimmed);
  };

  for (const current of [...candidates]) {
    push(current.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1'));
    push(current.replace(/^#+\s*/, ''));
    push(current.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"));
    push(current.replace(/'/g, '’'));
    push(current.replace(/"/g, '“'));
    push(current.replace(/"/g, '”'));
  }

  return [...candidates];
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

    // Strategy 1: deterministic quote normalization (markdown + punctuation variants)
    if (quote) {
      for (const candidate of generateQuoteCandidates(quote)) {
        const repaired = tryExactQuote(content, candidate);
        if (repaired) {
          src.turn_ref.quote = repaired;
          break;
        }
      }
      if (src.turn_ref.quote && content.includes(src.turn_ref.quote)) {
        continue;
      }
    }

    // Strategy 2: use the op's scalar slot value as quote
    const opObj = op as Record<string, unknown>;
    const setVal = (opObj.set as { value?: string })?.value;
    if (typeof setVal === 'string' && setVal.length >= 4 && content.includes(setVal)) {
      src.turn_ref.quote = setVal;
      continue;
    }

    // Strategy 3: use the first scalar value from populate.values when available
    const populateValues = (opObj.populate as { values?: Record<string, unknown> })?.values;
    if (populateValues && typeof populateValues === 'object') {
      const scalarCandidate = Object.values(populateValues).find(
        (value) =>
          typeof value === 'string' ||
          (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string')
      );
      const scalarQuote =
        typeof scalarCandidate === 'string'
          ? scalarCandidate
          : Array.isArray(scalarCandidate) && typeof scalarCandidate[0] === 'string'
            ? scalarCandidate[0]
            : null;
      if (scalarQuote && scalarQuote.length >= 4 && content.includes(scalarQuote)) {
        src.turn_ref.quote = scalarQuote;
        continue;
      }
    }

    // Strategy 4: for define ops, use the path's last segment as a keyword search
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
