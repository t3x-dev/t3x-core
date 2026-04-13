/**
 * L3 — read-side queries over the sourceIndex produced by replay.
 */

import type { Source } from '@t3x-dev/core';

/**
 * Returns the Source for a given slot or node path. Exact match wins;
 * otherwise walks ancestors (parent, grandparent, ...) and returns the
 * first one with an indexed source. Returns null if nothing matches.
 */
export function getSlotSource(idx: Map<string, Source>, path: string): Source | null {
  if (idx.has(path)) return idx.get(path) ?? null;
  const parts = path.split('/');
  while (parts.length > 1) {
    parts.pop();
    const parent = parts.join('/');
    if (idx.has(parent)) return idx.get(parent) ?? null;
  }
  return null;
}
