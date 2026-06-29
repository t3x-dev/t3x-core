/**
 * Deterministic, language-portable equality keys and ordering for YValue.
 *
 * - Strings compare by Unicode codepoint, not UTF-16 code unit. JS's
 *   default `<`/`>` and `Array.prototype.sort` compare code units, which
 *   diverges for non-BMP characters (a surrogate pair's high surrogate
 *   is in U+D800..U+DFFF, below BMP private-use chars at U+E000+, even
 *   though the codepoint it represents is U+10000+). A spec that claims
 *   portable order must compare codepoints directly.
 *
 * - `canonicalKey` encodes a value as a string by recursively sorting
 *   mapping keys by codepoint and emitting JSON-style scalars. Two
 *   YValues are equal iff their canonical encodings are equal — this
 *   gives `unique` a portable equivalence relation that does not depend
 *   on insertion order, runtime, or YAML loader.
 */

import type { YValue } from './types';

/**
 * Compare two strings by Unicode codepoint.
 *
 * Iterating a string with `for…of` (or `Symbol.iterator`) yields one
 * "character" per codepoint, automatically pairing surrogates. Each
 * yielded chunk is a 1- or 2-char string whose codepoint we read with
 * `codePointAt(0)`. We compare codepoints numerically; on a tie we
 * advance both iterators.
 */
export function compareCodepoints(a: string, b: string): number {
  const ai = a[Symbol.iterator]();
  const bi = b[Symbol.iterator]();
  while (true) {
    const ar = ai.next();
    const br = bi.next();
    if (ar.done && br.done) return 0;
    if (ar.done) return -1;
    if (br.done) return 1;
    const ac = (ar.value as string).codePointAt(0) as number;
    const bc = (br.value as string).codePointAt(0) as number;
    if (ac !== bc) return ac < bc ? -1 : 1;
  }
}

export function canonicalKey(value: YValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalKey).join(',') + ']';
  }
  const obj = value as { [key: string]: YValue };
  const keys = Object.keys(obj).sort(compareCodepoints);
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalKey(obj[k])).join(',') + '}';
}

/**
 * Audit-facing canonical JSON serialization for YOPS document-model values.
 *
 * This intentionally reuses the same codepoint-ordered mapping rule as
 * `canonicalKey`, so equality/order helpers and audit serialization agree.
 * Today it is deliberately the same serialization function as `canonicalKey`;
 * changing one without the other would be a conscious contract change.
 * It is a YOPS canonical form; do not label it RFC 8785/JCS unless the spec
 * and tests explicitly adopt that external algorithm.
 */
export function canonicalJson(value: YValue): string {
  return canonicalKey(value);
}

/**
 * Codepoint comparison for two YValues used by `sort`.
 *
 * Type rank: null < boolean < number < string < array < mapping. Within
 * each type, scalars compare by value (codepoint for strings); arrays
 * and mappings compare by their canonical encoding, which itself uses
 * codepoint order for keys.
 */
const TYPE_RANK: Record<string, number> = {
  null: 0,
  boolean: 1,
  number: 2,
  string: 3,
  array: 4,
  object: 5,
};

function rankOf(v: YValue): number {
  if (v === null) return TYPE_RANK.null;
  if (typeof v === 'boolean') return TYPE_RANK.boolean;
  if (typeof v === 'number') return TYPE_RANK.number;
  if (typeof v === 'string') return TYPE_RANK.string;
  if (Array.isArray(v)) return TYPE_RANK.array;
  return TYPE_RANK.object;
}

export function compareYValues(a: YValue, b: YValue): number {
  const ra = rankOf(a);
  const rb = rankOf(b);
  if (ra !== rb) return ra - rb;

  if (a === null && b === null) return 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return a === b ? 0 : a ? 1 : -1;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return compareCodepoints(a, b);
  }

  // Arrays and mappings fall back to canonical-string comparison. Both
  // canonical encodings use codepoint key order, so comparing them by
  // codepoint preserves the portable rule end-to-end.
  return compareCodepoints(canonicalKey(a), canonicalKey(b));
}
