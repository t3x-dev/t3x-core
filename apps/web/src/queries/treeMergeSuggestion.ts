/**
 * L3 — imperative AI merge-suggestion fetcher for a single conflicting
 * tree node. Wraps the L1 `getTreeMergeSuggestion` call so components
 * never reach into `@/infrastructure/diff` directly.
 */

import { getTreeMergeSuggestion } from '@/infrastructure/diff';
import type { TreeMergeSuggestion } from '@/types/api';

export interface ConflictNode {
  type: string;
  slots: Record<string, unknown>;
}

export function fetchTreeMergeSuggestion(
  mergeId: string,
  treeId: string,
  sourceNode: ConflictNode,
  targetNode: ConflictNode
): Promise<TreeMergeSuggestion | null> {
  return getTreeMergeSuggestion(mergeId, treeId, sourceNode, targetNode);
}
