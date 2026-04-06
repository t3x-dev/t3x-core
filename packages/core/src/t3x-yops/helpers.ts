import type { TreeNode } from '../semantic/types';

/** Get the parent portion of a slash path. "a/b/c" → "a/b", "a" → "" */
export function getParentPath(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

/** Get the last segment of a slash path. "a/b/c" → "c", "a" → "a" */
export function getNodeKey(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Find a node by slash-separated path in a tree array. */
export function findNode(trees: TreeNode[], path: string): TreeNode | undefined {
  const segments = path.split('/');
  let current: TreeNode | undefined;
  current = trees.find((t) => t.key === segments[0]);
  if (!current) return undefined;
  for (let i = 1; i < segments.length; i++) {
    current = current.children.find((c) => c.key === segments[i]);
    if (!current) return undefined;
  }
  return current;
}

/** Deep clone a TreeNode and all its children. */
export function cloneTree(node: TreeNode): TreeNode {
  return {
    key: node.key,
    slots: structuredClone(node.slots),
    children: node.children.map(cloneTree),
    ...(node.slot_quotes ? { slot_quotes: { ...node.slot_quotes } } : {}),
    ...(node.source !== undefined ? { source: node.source } : {}),
  };
}
