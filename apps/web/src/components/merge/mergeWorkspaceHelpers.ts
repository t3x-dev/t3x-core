import type { MergeResult, SemanticContent, TreeNode } from '@t3x-dev/core';
import type { TreeResolution } from './ConflictCard';

/**
 * Find a TreeNode by slash-delimited path (e.g. "hangzhou_trip/dining")
 */
export function findNodeByPath(trees: TreeNode[], path: string): TreeNode | null {
  const segments = path.split('/');
  const root = trees.find((t) => t.key === segments[0]);
  if (!root) return null;
  let current = root;
  for (let i = 1; i < segments.length; i++) {
    const child = current.children.find((c) => c.key === segments[i]);
    if (!child) return null;
    current = child;
  }
  return current;
}

/**
 * Look up a TreeNode from source or target content by path
 */
export function findNode(
  sourceContent: SemanticContent | undefined,
  targetContent: SemanticContent | undefined,
  path: string
): TreeNode | null {
  if (sourceContent) {
    const node = findNodeByPath(sourceContent.trees, path);
    if (node) return node;
  }
  if (targetContent) {
    const node = findNodeByPath(targetContent.trees, path);
    if (node) return node;
  }
  return null;
}

/**
 * Build merged SemanticContent from tree resolutions (tree-primary)
 */
export function buildMergedContent(
  mergeResult: MergeResult,
  resolutions: Map<string, TreeResolution>,
  keepSource: Set<string>,
  keepTarget: Set<string>,
  sourceContent?: SemanticContent,
  targetContent?: SemanticContent
): SemanticContent {
  const trees: TreeNode[] = [];

  // Auto-kept nodes (take from source since they're identical)
  for (const path of mergeResult.autoKept) {
    const node = findNode(sourceContent, targetContent, path);
    if (node) trees.push(node);
  }

  // Resolved conflicts
  for (const conflict of mergeResult.conflicts) {
    const resolution = resolutions.get(conflict.path);
    if (!resolution) continue;

    const sourceNode = sourceContent
      ? findNodeByPath(sourceContent.trees, conflict.path)
      : null;
    const targetNode = targetContent
      ? findNodeByPath(targetContent.trees, conflict.path)
      : null;

    switch (resolution.type) {
      case 'source':
        if (sourceNode) trees.push(sourceNode);
        break;
      case 'target':
        if (targetNode) trees.push(targetNode);
        break;
      case 'both':
        if (sourceNode) trees.push(sourceNode);
        if (targetNode) trees.push(targetNode);
        break;
      case 'per-slot': {
        // Build a merged node from per-slot choices
        const mergedSlots: Record<string, unknown> = {};
        const srcSlots = sourceNode?.slots ?? {};
        const tgtSlots = targetNode?.slots ?? {};
        const allKeys = new Set([...Object.keys(srcSlots), ...Object.keys(tgtSlots)]);
        const conflictKeySet = new Set(conflict.slotConflicts.map((sc) => sc.key));
        for (const key of allKeys) {
          if (conflictKeySet.has(key)) {
            const choice = resolution.slotChoices[key];
            if (choice === 'source') {
              mergedSlots[key] = srcSlots[key];
            } else {
              mergedSlots[key] = tgtSlots[key];
            }
          } else {
            mergedSlots[key] = srcSlots[key] ?? tgtSlots[key];
          }
        }
        trees.push({
          key: conflict.path.split('/').pop() ?? conflict.path,
          slots: mergedSlots as TreeNode['slots'],
          children: sourceNode?.children ?? targetNode?.children ?? [],
        });
        break;
      }
    }
  }

  // Source-only nodes (user toggleable)
  for (const path of mergeResult.onlyInSource) {
    if (keepSource.has(path)) {
      const node = sourceContent ? findNodeByPath(sourceContent.trees, path) : null;
      if (node) trees.push(node);
    }
  }

  // Target-only nodes (user toggleable)
  for (const path of mergeResult.onlyInTarget) {
    if (keepTarget.has(path)) {
      const node = targetContent ? findNodeByPath(targetContent.trees, path) : null;
      if (node) trees.push(node);
    }
  }

  // Union all relations
  const relations = [
    ...mergeResult.relationsInBoth,
    ...mergeResult.relationsOnlyInSource,
    ...mergeResult.relationsOnlyInTarget,
  ];

  return { trees, relations };
}
