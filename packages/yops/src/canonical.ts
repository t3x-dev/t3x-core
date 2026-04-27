/**
 * Deterministic, language-portable equality keys for YValue.
 *
 * Encodes a value as a string by recursively sorting mapping keys
 * lexicographically (codepoint order) and emitting JSON-style scalars.
 * Two YValues are equal iff their canonical encodings are equal — this
 * gives `unique` a portable equivalence relation that does not depend on
 * insertion order, runtime, or YAML loader.
 */

import type { YValue } from './types';

export function canonicalKey(value: YValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalKey).join(',') + ']';
  }
  const obj = value as { [key: string]: YValue };
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalKey(obj[k])).join(',') + '}';
}

/**
 * Codepoint comparison for two YValues used by `sort`.
 *
 * Locale-sensitive comparison (e.g. `localeCompare`) is not portable across
 * languages or runtimes. This comparator follows the spec's deterministic
 * order: null < boolean < number < string < array < mapping; within each
 * type, JS's default `<`/`>` (codepoint order for strings) is used.
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
    return a < b ? -1 : a > b ? 1 : 0;
  }

  // Arrays and mappings fall back to canonical-string comparison.
  const sa = canonicalKey(a);
  const sb = canonicalKey(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
