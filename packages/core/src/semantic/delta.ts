import type { TreeChangeBatch, SemanticContent, SlotValue, TreeNode } from './types';

/**
 * Apply a tree change batch to a semantic snapshot, returning a new snapshot.
 * Pure function — does not mutate the input.
 *
 * Operates on content.trees (array of root TreeNodes).
 * The `parent_path` in add changes uses format "root_key/path/to/parent".
 * The first path segment identifies which root tree to operate on.
 *
 * Note: The result is NOT automatically validated. Callers should run
 * `validateIntegrity()` on the result before committing to storage.
 */
export function applyTreeChanges(snapshot: SemanticContent, batch: TreeChangeBatch): SemanticContent {
  const trees = snapshot.trees.map(deepCloneTree);
  let relations = [...snapshot.relations];

  for (const change of batch.changes) {
    switch (change.action) {
      case 'add': {
        const newNode = deepCloneTree(change.node);
        if (change.slot_quotes) {
          applyQuotesToNode(newNode, change.slot_quotes, newNode.key);
        }
        if (change.parent_path === '') {
          // Empty parent_path → add as a new root tree
          trees.push(newNode);
        } else {
          const parent = findNodeInTrees(trees, change.parent_path);
          if (!parent) break;
          parent.children.push(newNode);
        }
        break;
      }
      case 'update': {
        const target = findNodeInTrees(trees, change.target_path);
        if (!target) break;
        for (const [key, value] of Object.entries(change.slots)) {
          if (value === null) {
            delete target.slots[key];
            if (target.slot_quotes) delete target.slot_quotes[key];
          } else {
            target.slots[key] = value as SlotValue;
          }
        }
        if (change.slot_quotes) {
          if (!target.slot_quotes) target.slot_quotes = {};
          for (const [quotePath, quoteValue] of Object.entries(change.slot_quotes)) {
            const segments = quotePath.split('.');
            const slotKey = segments[segments.length - 1];
            target.slot_quotes[slotKey] = quoteValue;
          }
        }
        break;
      }
      case 'remove': {
        removeNodeFromTrees(trees, change.target_path);
        const removedPath = change.target_path;
        relations = relations.filter(
          (r) =>
            r.from !== removedPath &&
            !r.from.startsWith(`${removedPath}/`) &&
            r.to !== removedPath &&
            !r.to.startsWith(`${removedPath}/`)
        );
        break;
      }
    }
  }

  if (batch.new_relations) {
    relations.push(...batch.new_relations);
  }
  if (batch.remove_relations) {
    for (const toRemove of batch.remove_relations) {
      const idx = relations.findIndex(
        (r) => r.from === toRemove.from && r.to === toRemove.to && r.type === toRemove.type
      );
      if (idx !== -1) relations.splice(idx, 1);
    }
  }

  return { trees, relations };
}

// ── Internal helpers ──

/**
 * Deep clone a TreeNode.
 */
export function deepCloneTree(node: TreeNode): TreeNode {
  return {
    ...node,
    slots: JSON.parse(JSON.stringify(node.slots)),
    children: node.children.map(deepCloneTree),
    ...(node.slot_quotes ? { slot_quotes: { ...node.slot_quotes } } : {}),
  };
}

/**
 * Find a node by path across multiple root trees.
 * The first segment of the path identifies the root tree by key.
 */
export function findNodeInTrees(trees: TreeNode[], path: string): TreeNode | null {
  const segments = path.split('/');
  const rootKey = segments[0];
  const root = trees.find((t) => t.key === rootKey);
  if (!root) return null;
  return findNodeByPath(root, path);
}

/**
 * Find a node by its path (e.g., "hangzhou_trip/dining").
 */
export function findNodeByPath(root: TreeNode, path: string): TreeNode | null {
  const segments = path.split('/');
  if (segments[0] !== root.key) return null;
  let current = root;
  for (let i = 1; i < segments.length; i++) {
    const child = current.children.find((c) => c.key === segments[i]);
    if (!child) return null;
    current = child;
  }
  return current;
}

/**
 * Remove a node by path across multiple root trees.
 * If the path points to a root tree itself, remove the whole tree.
 */
export function removeNodeFromTrees(trees: TreeNode[], path: string): boolean {
  const segments = path.split('/');
  if (segments.length === 1) {
    // Removing a root tree
    const idx = trees.findIndex((t) => t.key === segments[0]);
    if (idx === -1) return false;
    trees.splice(idx, 1);
    return true;
  }
  const rootKey = segments[0];
  const root = trees.find((t) => t.key === rootKey);
  if (!root) return false;
  return removeNodeByPath(root, path);
}

/**
 * Remove a node by its path. Returns true if removed, false otherwise.
 */
function removeNodeByPath(root: TreeNode, path: string): boolean {
  const segments = path.split('/');
  if (segments.length === 1) return false;
  const parentPath = segments.slice(0, -1).join('/');
  const parent = findNodeByPath(root, parentPath);
  if (!parent) return false;
  const childKey = segments[segments.length - 1];
  const idx = parent.children.findIndex((c) => c.key === childKey);
  if (idx === -1) return false;
  parent.children.splice(idx, 1);
  return true;
}

/**
 * Apply slot_quotes to a node and its children recursively.
 */
export function applyQuotesToNode(
  node: TreeNode,
  allQuotes: Record<string, string>,
  nodePathPrefix: string
): void {
  for (const [quotePath, quoteValue] of Object.entries(allQuotes)) {
    const segments = quotePath.split('.');
    if (segments[0] === nodePathPrefix) {
      if (segments.length === 2) {
        if (!node.slot_quotes) node.slot_quotes = {};
        node.slot_quotes[segments[1]] = quoteValue;
      } else {
        const childKey = segments[1];
        const child = node.children.find((c) => c.key === childKey);
        if (child) {
          const childPrefix = `${nodePathPrefix}.${childKey}`;
          applyQuotesToNode(child, { [quotePath]: quoteValue }, childPrefix);
        }
      }
    }
  }
}
