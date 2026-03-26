import type { Relation, SlotValue } from './types';

const MAX_DEPTH = 10;

/**
 * Deep equality comparison for SlotValue types.
 * Handles string, number, boolean (defensive), references, nested objects, and arrays.
 * Returns false if nesting exceeds MAX_DEPTH to prevent stack overflow.
 */
export function deepEqual(a: SlotValue | undefined, b: SlotValue | undefined, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  // Primitives (string, number, boolean) — caught by a === b above if equal
  if (typeof a !== 'object') return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i], depth + 1));
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;
  const aObj = a as unknown as Record<string, unknown>;
  const bObj = b as unknown as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (k) => k in bObj && deepEqual(aObj[k] as SlotValue, bObj[k] as SlotValue, depth + 1)
  );
}

/**
 * Relation identity key (from|to|type).
 * Confidence is treated as metadata — two relations with the same
 * from/to/type but different confidence are considered the same relation.
 */
export function relKey(r: Relation): string {
  return `${r.from}|${r.to}|${r.type}`;
}
