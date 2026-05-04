export interface PromptTurnInput {
  turn_hash: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

export interface PromptTurn extends PromptTurnInput {
  turn_tag: string;
}

const SMART_QUOTES: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
};

export function buildPromptTurnMap(turns: PromptTurnInput[]): {
  taggedTurns: PromptTurn[];
  turnHashByTag: Record<string, string>;
} {
  const taggedTurns = turns.map((turn, index) => ({
    ...turn,
    turn_tag: `T${index + 1}`,
  }));

  const turnHashByTag = Object.fromEntries(
    taggedTurns.map((turn) => [turn.turn_tag, turn.turn_hash])
  );

  return { taggedTurns, turnHashByTag };
}

// ─── Canonicalize multi-value YOp scalars ───────────────────────────────────
//
// LLM proposals routinely emit slot values like
//   value: "landscape, studio, fashion, commercial"
// but the canonical YOp shape for a multi-value slot is a YAML sequence:
//   value: ["landscape", "studio", "fashion", "commercial"]
//
// `canonicalizeMultiValueScalar` turns highly likely list-strings into
// arrays using a deterministic, conservative rule. The prompt remains
// advisory — this transform is the contract. See issue #964 for context.
//
// Convert a string to an array iff all hold:
//   1. has at least one comma
//   2. ≥ 2 non-empty parts after splitting and trimming
//   3. ≤ 12 parts total
//   4. each part ≤ 6 words and ≤ 48 chars
//   5. no part contains sentence punctuation (`.;:!?`)
//   6. nothing in the string looks like a URL, ISO date, year mention,
//      decimal number, numeric range, or code-like token
// Anything else stays scalar. Non-string inputs (numbers, booleans, arrays,
// nulls, objects) pass through unchanged.

const CANONICALIZE_MAX_PARTS = 12;
const CANONICALIZE_MAX_WORDS_PER_PART = 6;
const CANONICALIZE_MAX_CHARS_PER_PART = 48;

const SENTENCE_PUNCTUATION = /[.;:!?]/;

const URL_LIKE = /^https?:\/\//i;
const URL_LIKE_HOST = /\b[a-z0-9-]+\.[a-z]{2,}(\/|\b)/i;
const ISO_DATE = /\b\d{4}-\d{1,2}-\d{1,2}\b/;
const MONTH_NAME = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;
const YEAR_MENTION = /\b(?:19|20)\d{2}\b/;
const DECIMAL_NUMBER = /\b\d+\.\d+\b/;
const RANGE_LIKE = /\b\d+\s*[-–]\s*\d+\b/;
const CODE_TOKENS = /[`<>]|=>|\(\)|\[\]|\{\}|::/;

function looksAmbiguousForCanonicalization(raw: string): boolean {
  if (URL_LIKE.test(raw) || URL_LIKE_HOST.test(raw)) return true;
  if (ISO_DATE.test(raw) || MONTH_NAME.test(raw) || YEAR_MENTION.test(raw)) return true;
  if (DECIMAL_NUMBER.test(raw) || RANGE_LIKE.test(raw)) return true;
  if (CODE_TOKENS.test(raw)) return true;
  return false;
}

/**
 * Convert a multi-value scalar string to a YAML sequence when it cleanly
 * fits the V1 canonicalization rule. Non-string inputs (numbers, booleans,
 * arrays, nulls, objects) pass through unchanged. Strings that fail any
 * predicate stay scalar.
 *
 * Pure. No I/O.
 */
export function canonicalizeMultiValueScalar(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  // Need at least one comma — otherwise it's a single-value scalar.
  if (!value.includes(',')) return value;

  // Reject ambiguous shapes wholesale before splitting.
  if (looksAmbiguousForCanonicalization(value)) return value;

  const rawParts = value.split(',');
  if (rawParts.length > CANONICALIZE_MAX_PARTS) return value;

  const parts: string[] = [];
  for (const raw of rawParts) {
    const part = raw.trim();
    if (part.length === 0) return value; // empty segment → ambiguous
    if (part.length > CANONICALIZE_MAX_CHARS_PER_PART) return value;
    if (SENTENCE_PUNCTUATION.test(part)) return value;
    const wordCount = part.split(/\s+/).filter(Boolean).length;
    if (wordCount > CANONICALIZE_MAX_WORDS_PER_PART) return value;
    parts.push(part);
  }

  // We need at least two parts to qualify as a list — `"foo,"` would have
  // tripped the empty-segment guard above, but be defensive.
  if (parts.length < 2) return value;

  return parts;
}

/**
 * Apply `canonicalizeMultiValueScalar` to every value of a record. Used for
 * `populate.values` and similar slot maps. Non-string values pass through.
 */
export function canonicalizeMultiValueScalarsInRecord<T extends Record<string, unknown>>(
  record: T
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = canonicalizeMultiValueScalar(value);
  }
  return out;
}

/**
 * Walk a parsed YOp array and canonicalize the value slots that carry
 * possibly-multi-value scalars. Acts on the two YOp verbs that hold slot
 * values today: `set` (single value) and `populate` (record of values).
 *
 * Returns a new array; the input is not mutated. Non-targeted op shapes
 * pass through unchanged. Source metadata is preserved verbatim.
 */
export function canonicalizeYOps<T extends Record<string, unknown>>(ops: readonly T[]): T[] {
  return ops.map((op) => canonicalizeYOp(op));
}

export function canonicalizeYOp<T extends Record<string, unknown>>(op: T): T {
  const setPayload = op.set;
  if (setPayload && typeof setPayload === 'object' && !Array.isArray(setPayload)) {
    const inner = setPayload as Record<string, unknown>;
    if ('value' in inner) {
      const next = canonicalizeMultiValueScalar(inner.value);
      if (next !== inner.value) {
        return { ...op, set: { ...inner, value: next } } as T;
      }
    }
  }

  const populatePayload = op.populate;
  if (populatePayload && typeof populatePayload === 'object' && !Array.isArray(populatePayload)) {
    const inner = populatePayload as Record<string, unknown>;
    const values = inner.values;
    if (values && typeof values === 'object' && !Array.isArray(values)) {
      const nextValues = canonicalizeMultiValueScalarsInRecord(values as Record<string, unknown>);
      // Only allocate a new op when something actually changed.
      let changed = false;
      for (const key of Object.keys(nextValues)) {
        if (nextValues[key] !== (values as Record<string, unknown>)[key]) {
          changed = true;
          break;
        }
      }
      if (changed) {
        return { ...op, populate: { ...inner, values: nextValues } } as T;
      }
    }
  }

  return op;
}

export function normalizeExtractionText(rawText: string): string {
  const withoutBom = rawText.replace(/^\uFEFF/, '');
  const normalizedLines = withoutBom.replace(/\r\n?/g, '\n');
  const trimmedBeforeFenceStrip = normalizedLines.trim();
  const strippedFences = trimmedBeforeFenceStrip.replace(
    /^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/u,
    '$1'
  );
  const normalizedQuotes = strippedFences.replace(
    /[\u2018\u2019\u201C\u201D]/g,
    (match) => SMART_QUOTES[match] ?? match
  );
  const trimmed = normalizedQuotes.trim();

  if (trimmed.length === 0) {
    return '';
  }

  return `${trimmed}\n`;
}
