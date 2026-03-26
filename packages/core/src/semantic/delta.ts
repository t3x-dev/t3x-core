import { flattenTree, yamlObjectToTreeNode } from './tree';
import type { Delta, DeltaLogEntry, Relation, SemanticContent, SlotValue, TreeNode } from './types';

/**
 * Apply a delta to a semantic snapshot, returning a new snapshot.
 * Pure function — does not mutate the input.
 *
 * Note: The result is NOT automatically validated. Callers should run
 * `validateIntegrity()` on the result before committing to storage.
 */
export function applyDelta(snapshot: SemanticContent, delta: Delta): SemanticContent {
  const frames = snapshot.frames.map((f) => ({ ...f, slots: { ...f.slots } }));
  let relations = [...snapshot.relations];

  for (const change of delta.changes) {
    switch (change.action) {
      case 'add': {
        // If a frame with the same ID already exists, treat as update (LLM sometimes
        // emits "add" for existing IDs in delta mode — auto-correct to avoid duplicates)
        const existingIdx = frames.findIndex((f) => f.id === change.frame.id);
        if (existingIdx !== -1) {
          const merged = {
            ...frames[existingIdx],
            ...change.frame,
            slots: { ...frames[existingIdx].slots, ...change.frame.slots },
          };
          frames[existingIdx] = merged;
        } else {
          frames.push({ ...change.frame, slots: { ...change.frame.slots } });
        }
        break;
      }

      case 'update': {
        const idx = frames.findIndex((f) => f.id === change.target);
        if (idx === -1) break; // Skip silently — frame may have been removed by a prior delta
        const updated = { ...frames[idx], slots: { ...frames[idx].slots } };
        for (const [key, value] of Object.entries(change.slots)) {
          if (value === null) {
            delete updated.slots[key];
          } else {
            updated.slots[key] = value as SlotValue;
          }
        }
        frames[idx] = updated;
        break;
      }

      case 'remove': {
        const idx = frames.findIndex((f) => f.id === change.target);
        if (idx === -1) break; // Skip silently — frame already removed or never existed (idempotent)
        const removedId = change.target;
        frames.splice(idx, 1);
        relations = relations.filter((r) => r.from !== removedId && r.to !== removedId);
        break;
      }
    }
  }

  if (delta.new_relations) {
    relations.push(...delta.new_relations);
  }

  if (delta.remove_relations) {
    for (const toRemove of delta.remove_relations) {
      const idx = relations.findIndex(
        (r) => r.from === toRemove.from && r.to === toRemove.to && r.type === toRemove.type
      );
      if (idx !== -1) relations.splice(idx, 1);
    }
  }

  return { topic: snapshot.topic, root_frame_id: snapshot.root_frame_id, frames, relations };
}

export function buildDraft(deltaLog: DeltaLogEntry[]): SemanticContent {
  let draft: SemanticContent = { frames: [], relations: [] };
  for (const entry of deltaLog) {
    draft = applyDelta(draft, entry.delta);
  }
  return draft;
}

// ── Tree-native delta support ──

/**
 * Tree-native delta change types.
 */
export interface TreeNativeChange {
  action: 'add' | 'update' | 'remove';
  parent_path?: string;
  target_path?: string;
  node?: Record<string, unknown>;
  slots?: Record<string, SlotValue | null>;
  slot_quotes?: Record<string, string>;
  reason?: string;
}

/**
 * Tree-native delta format.
 */
export interface TreeNativeDelta {
  changes: TreeNativeChange[];
  drift_detected?: boolean;
  new_relations?: Relation[];
  remove_relations?: Relation[];
}

/**
 * Apply a tree-native delta to a SemanticContent with a tree.
 * Returns new SemanticContent with updated tree and recomputed frames.
 */
export function applyTreeDelta(snapshot: SemanticContent, delta: TreeNativeDelta): SemanticContent {
  if (!snapshot.tree) {
    throw new Error('applyTreeDelta requires tree-native content (snapshot.tree must exist)');
  }

  const tree = deepCloneTree(snapshot.tree);
  let relations = [...snapshot.relations];

  for (const change of delta.changes) {
    switch (change.action) {
      case 'add': {
        if (!change.parent_path || !change.node) break;
        const parent = findNodeByPath(tree, change.parent_path);
        if (!parent) break;
        for (const [key, value] of Object.entries(change.node)) {
          const newNode = yamlObjectToTreeNode(key, value);
          if (change.slot_quotes) {
            applyQuotesToNode(newNode, change.slot_quotes, key);
          }
          parent.children.push(newNode);
        }
        break;
      }
      case 'update': {
        if (!change.target_path || !change.slots) break;
        const target = findNodeByPath(tree, change.target_path);
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
        if (!change.target_path) break;
        removeNodeByPath(tree, change.target_path);
        const removedPath = change.target_path!;
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

  if (delta.new_relations) {
    relations.push(...delta.new_relations);
  }
  if (delta.remove_relations) {
    for (const toRemove of delta.remove_relations) {
      const idx = relations.findIndex(
        (r) => r.from === toRemove.from && r.to === toRemove.to && r.type === toRemove.type
      );
      if (idx !== -1) relations.splice(idx, 1);
    }
  }

  return { tree, frames: flattenTree(tree), relations, topic: snapshot.topic };
}

/**
 * Deep clone a TreeNode.
 */
function deepCloneTree(node: TreeNode): TreeNode {
  return {
    ...node,
    slots: JSON.parse(JSON.stringify(node.slots)),
    children: node.children.map(deepCloneTree),
    ...(node.slot_quotes ? { slot_quotes: { ...node.slot_quotes } } : {}),
  };
}

/**
 * Find a node by its path (e.g., "hangzhou_trip/dining").
 */
function findNodeByPath(root: TreeNode, path: string): TreeNode | null {
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
function applyQuotesToNode(
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
