import type { Relation, SlotValue } from './types';

/**
 * Deep equality comparison for SlotValue types.
 * Handles string, number, boolean (defensive), SlotRef, InlineFrame, and arrays.
 */
export function deepEqual(a: SlotValue | undefined, b: SlotValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  // Primitives (string, number, boolean) — caught by a === b above if equal
  if (typeof a !== 'object') return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;
  const aObj = a as unknown as Record<string, unknown>;
  const bObj = b as unknown as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => k in bObj && deepEqual(aObj[k] as SlotValue, bObj[k] as SlotValue));
}

/**
 * Relation identity key (from|to|type).
 * Confidence is treated as metadata — two relations with the same
 * from/to/type but different confidence are considered the same relation.
 */
export function relKey(r: Relation): string {
  return `${r.from}|${r.to}|${r.type}`;
}
