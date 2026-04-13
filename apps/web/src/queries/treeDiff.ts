/**
 * L3 — imperative "diff two commits by hash" helper for the canvas
 * commit-history panel.
 */

import { type DiffResponse, getTreeDiff } from '@/infrastructure/treeDiff';

export function fetchTreeDiff(baseHash: string, targetHash: string): Promise<DiffResponse> {
  return getTreeDiff(baseHash, targetHash);
}

export type { DiffResponse };
