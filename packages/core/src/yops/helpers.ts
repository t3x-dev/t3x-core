/**
 * YOps — Tree Traversal and Mutation Helpers
 *
 * Pure functions for navigating and modifying TreeNode arrays.
 */

import type { Relation, TreeNode } from '../semantic/types';
import { SNAKE_CASE_KEY } from './types';

/** Check if a key matches snake_case: starts with lowercase letter, then lowercase/digits/underscores. */
export function isValidKey(key: string): boolean {
  return SNAKE_CASE_KEY.test(key);
}

/** Get the parent portion of a slash-separated path. "a/b/c" -> "a/b", "a" -> "" */
export function getParentPath(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

/** Get the last segment of a slash-separated path. "a/b/c" -> "c", "a" -> "a" */
export function getNodeKey(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Find a node by slash-separated path in a tree array. Returns undefined if not found. */
export function findNode(trees: TreeNode[], path: string): TreeNode | undefined {
  const segments = path.split('/');
  let current: TreeNode | undefined;

  // Find root
  current = trees.find((t) => t.key === segments[0]);
  if (!current) return undefined;

  for (let i = 1; i < segments.length; i++) {
    current = current.children.find((c) => c.key === segments[i]);
    if (!current) return undefined;
  }

  return current;
}

/** Find parent node and child info for a path. */
export function findParentAndChild(
  trees: TreeNode[],
  path: string,
): {
  parent: TreeNode | null;
  child: TreeNode | undefined;
  childIndex: number;
  isRoot: boolean;
} {
  const parentPath = getParentPath(path);
  const key = getNodeKey(path);

  if (parentPath === '') {
    // Root-level node
    const idx = trees.findIndex((t) => t.key === key);
    return {
      parent: null,
      child: idx >= 0 ? trees[idx] : undefined,
      childIndex: idx,
      isRoot: true,
    };
  }

  const parent = findNode(trees, parentPath);
  if (!parent) {
    return { parent: null, child: undefined, childIndex: -1, isRoot: false };
  }

  const idx = parent.children.findIndex((c) => c.key === key);
  return {
    parent,
    child: idx >= 0 ? parent.children[idx] : undefined,
    childIndex: idx,
    isRoot: false,
  };
}

/** Check if a parent node has a child with the given key. */
export function hasSiblingKey(parent: TreeNode, key: string): boolean {
  return parent.children.some((c) => c.key === key);
}

/** Check if a root-level tree with the given key exists. */
export function hasRootKey(trees: TreeNode[], key: string): boolean {
  return trees.some((t) => t.key === key);
}

/** Replace old path prefixes in relations with a new path. */
export function updateRelationPaths(
  relations: Relation[],
  oldPath: string,
  newPath: string,
): Relation[] {
  return relations.map((r) => ({
    ...r,
    from: replacePath(r.from, oldPath, newPath),
    to: replacePath(r.to, oldPath, newPath),
  }));
}

function replacePath(value: string, oldPath: string, newPath: string): string {
  if (value === oldPath) return newPath;
  if (value.startsWith(oldPath + '/')) return newPath + value.slice(oldPath.length);
  return value;
}

/** Remove all relations that reference a given path or any of its children. */
export function removeRelationsForPath(relations: Relation[], path: string): Relation[] {
  return relations.filter((r) => {
    return !matchesPath(r.from, path) && !matchesPath(r.to, path);
  });
}

function matchesPath(value: string, path: string): boolean {
  return value === path || value.startsWith(path + '/');
}

/** Deep clone a TreeNode (and all children). */
export function cloneTree(node: TreeNode): TreeNode {
  return {
    key: node.key,
    slots: structuredClone(node.slots),
    children: node.children.map(cloneTree),
    ...(node.slot_quotes ? { slot_quotes: { ...node.slot_quotes } } : {}),
    ...(node.source !== undefined ? { source: node.source } : {}),
  };
}
