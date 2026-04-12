/**
 * L3 — read selectors over the replayed tree.
 * Pure; callers pass the tree (from store). No state here.
 */

import type { SemanticContent, TreeNode } from '@t3x-dev/core';

/**
 * Walk the tree following a slash-separated key path. Returns the matching
 * node or null if any segment is missing.
 */
export function findNodeByPath(tree: SemanticContent, path: string): TreeNode | null {
  const parts = path.split('/');
  let nodes: TreeNode[] = tree.trees;
  let match: TreeNode | null = null;
  for (const p of parts) {
    match = nodes.find((n) => n.key === p) ?? null;
    if (!match) return null;
    nodes = match.children;
  }
  return match;
}

export function isEmpty(tree: SemanticContent): boolean {
  return tree.trees.length === 0;
}
