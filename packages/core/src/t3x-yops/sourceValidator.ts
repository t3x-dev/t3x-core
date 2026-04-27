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
 * Inline markdown markers we know how to project away from raw turn
 * content. Order matters: longer markers first so `**` is matched
 * before the single-`*` italic rule. Block-level constructs (headings,
 * lists, links) are intentionally out of scope — those would change
 * structure, not just span boundaries, and projecting them invites
 * fuzzy matching.
 */
const PROJECTION_MARKERS = ['**', '*', '`'] as const;

interface MarkdownProjection {
  /** Raw content with paired inline markers removed. */
  stripped: string;
  /**
   * Per-character map: `rawIndexAt[i]` is the raw-content index that
   * produced `stripped[i]`. Monotonically increasing, so a contiguous
   * match in `stripped` always maps to a contiguous span in raw.
   */
  rawIndexAt: number[];
  /**
   * For each stripped position, the id of the paired-marker span the
   * character belongs to (`-1` for plain text outside any span). Used
   * to detect whether a match crosses a span boundary, which is what
   * makes balanced marker expansion safe.
   */
  spanIdAt: number[];
  /**
   * If `stripped[i]` is the first content character of a paired span,
   * `openMarkerAt[i]` is the raw index of that span's opening marker
   * (so a slice starting there includes the marker). `-1` otherwise.
   */
  openMarkerAt: number[];
  /**
   * If `stripped[i]` is the last content character of a paired span,
   * `closeMarkerEndAt[i]` is the raw index immediately after that
   * span's closing marker (so a slice ending there includes the
   * marker). `-1` otherwise.
   */
  closeMarkerEndAt: number[];
}

/**
 * Project raw turn content into a stripped form by removing the inner
 * characters of paired inline markdown markers (`**bold**`, `*italic*`,
 * `` `code` ``). Unpaired markers are left in place and treated as
 * literal characters — we only strip a marker when its closing
 * counterpart exists later in the string.
 *
 * Returns the projection plus enough metadata to map a stripped match
 * back to a *balanced* raw span (see `repairFromMarkdownProjection`).
 *
 * Determinism: single left-to-right scan, no regex backtracking, no
 * scoring. The same input always yields the same projection.
 */
function projectMarkdownToRaw(raw: string): MarkdownProjection {
  const strippedParts: string[] = [];
  const rawIndexAt: number[] = [];
  const spanIdAt: number[] = [];
  const openMarkerAt: number[] = [];
  const closeMarkerEndAt: number[] = [];
  let i = 0;
  let nextSpanId = 0;
  while (i < raw.length) {
    let matchedMarker: string | null = null;
    for (const marker of PROJECTION_MARKERS) {
      if (raw.startsWith(marker, i)) {
        const closeIdx = raw.indexOf(marker, i + marker.length);
        // Require a non-empty inner span. `closeIdx === i + marker.length`
        // means an empty pair like `**` or `` `` `` — ignore (treat as
        // literal so we don't lose those characters from the projection).
        if (closeIdx > i + marker.length) {
          matchedMarker = marker;
          const spanId = nextSpanId++;
          const openMarkerStart = i;
          const closeMarkerEnd = closeIdx + marker.length;
          for (let k = i + marker.length; k < closeIdx; k++) {
            const isFirstContent = k === i + marker.length;
            const isLastContent = k === closeIdx - 1;
            strippedParts.push(raw[k]);
            rawIndexAt.push(k);
            spanIdAt.push(spanId);
            openMarkerAt.push(isFirstContent ? openMarkerStart : -1);
            closeMarkerEndAt.push(isLastContent ? closeMarkerEnd : -1);
          }
          i = closeMarkerEnd;
          break;
        }
      }
    }
    if (matchedMarker === null) {
      strippedParts.push(raw[i]);
      rawIndexAt.push(i);
      spanIdAt.push(-1);
      openMarkerAt.push(-1);
      closeMarkerEndAt.push(-1);
      i += 1;
    }
  }
  return {
    stripped: strippedParts.join(''),
    rawIndexAt,
    spanIdAt,
    openMarkerAt,
    closeMarkerEndAt,
  };
}

/**
 * If `quote` is not a substring of `rawContent` but appears verbatim
 * in the markdown-stripped projection of the content, return the
 * corresponding contiguous raw span (which IS a substring of raw).
 * Otherwise return null.
 *
 * Boundary balance: when the match starts at the first content char of
 * a paired marker span AND extends past that span (so the closing
 * marker would already be inside the slice), the opening marker is
 * pulled in too — without this, repaired quotes look like
 * `foo** bar` / `A7R5 (A7R V)** if you want **maximum detail`: valid
 * raw substrings, but visibly malformed evidence in the YOps UI.
 * Symmetric on the trailing edge. Matches strictly inside a single
 * span (e.g. quoting `hello` from `**hello world**`) get NO expansion,
 * because adding only the opening or only the closing marker would
 * just orphan it the other way.
 *
 * Single match, first-occurrence (`indexOf`). No fuzzy scoring, no
 * fragment stitching — non-contiguous joins simply don't appear in
 * the projection and `indexOf` returns -1.
 */
function repairFromMarkdownProjection(rawContent: string, quote: string): string | null {
  if (!quote || rawContent.includes(quote)) return null;
  const projection = projectMarkdownToRaw(rawContent);
  const { stripped, rawIndexAt, spanIdAt, openMarkerAt, closeMarkerEndAt } = projection;
  if (stripped.length === 0) return null;
  const hit = stripped.indexOf(quote);
  if (hit < 0) return null;
  const end = hit + quote.length - 1;

  let rawStart = rawIndexAt[hit];
  let rawEnd = rawIndexAt[end] + 1;

  // Crossing-boundary expansion: only when the match start/end sit on
  // the first/last content char of a span AND the opposite end of the
  // match is *outside* that span. The span-id check is what keeps
  // matches strictly inside a span (`hello` ⊂ `**hello world**`) from
  // becoming unbalanced `**hello`.
  if (openMarkerAt[hit] >= 0 && spanIdAt[end] !== spanIdAt[hit]) {
    rawStart = openMarkerAt[hit];
  }
  if (closeMarkerEndAt[end] >= 0 && spanIdAt[hit] !== spanIdAt[end]) {
    rawEnd = closeMarkerEndAt[end];
  }

  const repaired = rawContent.slice(rawStart, rawEnd);
  // Defensive — the index map should guarantee this, but a regression
  // here would silently re-introduce unverifiable quotes. Cheaper to
  // re-check than to debug later.
  return rawContent.includes(repaired) ? repaired : null;
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
 *  2. Strip markdown markers from the QUOTE and retry against raw content
 *     (handles the case where the model emitted `**foo**` against plain content)
 *  3. Strip markdown markers from the CONTENT and retry the quote against the
 *     stripped projection, then map a hit back to a raw span (handles the
 *     inverse: model quoted rendered text against raw content with markers)
 *  4. Fall back to the op's slot value if it appears verbatim in the turn
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

    // Strategy 2: markdown source-span projection (content side).
    // Inverse of Strategy 1's quote-side stripping: when raw turn
    // content carries `**...**` / `*...*` / `` `...` `` markers but the
    // model quoted the rendered text, the bare quote isn't a substring
    // of raw. Project raw to stripped, locate the quote with first-
    // occurrence indexOf, then map back to the contiguous raw span
    // (which embeds whatever markers fell inside the matched stretch).
    // The substring-of-raw invariant is preserved by the index map.
    if (quote) {
      const projected = repairFromMarkdownProjection(content, quote);
      if (projected) {
        src.turn_ref.quote = projected;
        continue;
      }
    }

    // Strategy 3: use the op's scalar slot value as quote
    const opObj = op as Record<string, unknown>;
    const setVal = (opObj.set as { value?: string })?.value;
    if (typeof setVal === 'string' && setVal.length >= 4 && content.includes(setVal)) {
      src.turn_ref.quote = setVal;
      continue;
    }

    // Strategy 4: use the first scalar value from populate.values when available
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

    // Strategy 5: for define ops, use the path's last segment as a keyword search
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
