import type { Relation, SlotValue } from './types';

export function deepEqual(a: SlotValue | undefined, b: SlotValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as unknown as Record<string, unknown>;
    const bObj = b as unknown as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => k in bObj && deepEqual(aObj[k] as SlotValue, bObj[k] as SlotValue));
  }
  return false;
}

export function relKey(r: Relation): string {
  return `${r.from}|${r.to}|${r.type}`;
}
