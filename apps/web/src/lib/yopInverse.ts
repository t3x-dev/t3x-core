/**
 * yopInverse — Compute inverse YOp for undo
 *
 * Pure function. Given a YOp and the CURRENT draft (before the op is applied),
 * returns the inverse YOp that undoes the operation.
 *
 * 10 exact inverses + 3 context-based (nest/split/fold/merge).
 * Context-based inverses store pre-state in a _context property;
 * commandStore captures this into UndoEntry.context.
 */

import type { SemanticContent, SlotValue, TreeNode, YOp } from '@t3x-dev/core';
import { findNode, getNodeKey, getParentPath } from '@t3x-dev/core';

/** Inverse result — either a normal YOp or a context-carrying marker */
export type InverseResult = YOp | ContextInverse;

export interface ContextInverse {
  _context: {
    type: 'nest' | 'split' | 'fold' | 'merge';
    /** Snapshot of affected subtrees before the operation */
    snapshot: TreeNode[];
    /** The original op for reference */
    originalOp: YOp;
  };
}

export function isContextInverse(inv: InverseResult): inv is ContextInverse {
  return '_context' in inv;
}

/**
 * Compute the inverse of a YOp given the current draft state.
 * Must be called BEFORE the op is applied to the draft.
 */
export function computeInverse(op: YOp, draft: SemanticContent): InverseResult {
  if ('set' in op) return invertSet(op, draft);
  if ('unset' in op) return invertUnset(op, draft);
  if ('add' in op) return invertAdd(op);
  if ('drop' in op) return invertDrop(op, draft);
  if ('rename' in op) return invertRename(op);
  if ('clone' in op) return invertClone(op, draft);
  if ('move' in op) return invertMove(op);
  if ('relate' in op) return invertRelate(op);
  if ('unrelate' in op) return invertUnrelate(op);
  // Context-based: nest, split, fold, merge
  if ('nest' in op) return invertNest(op, draft);
  if ('split' in op) return invertSplit(op, draft);
  if ('fold' in op) return invertFold(op, draft);
  if ('merge' in op) return invertMerge(op, draft);
  // Fallback (should never hit)
  return op;
}

// ── Exact inverses ──

function invertSet(
  op: { set: { path: string; value: SlotValue; source: string; from: string } },
  draft: SemanticContent
): YOp {
  const nodePath = getParentPath(op.set.path);
  const slotKey = getNodeKey(op.set.path);
  const node = nodePath ? findNode(draft.trees, nodePath) : undefined;
  if (node && slotKey in node.slots) {
    // Existing slot → set back to old value
    return { set: { path: op.set.path, value: node.slots[slotKey], source: '', from: '' } };
  }
  // New slot → unset
  return { unset: { path: op.set.path } };
}

function invertUnset(op: { unset: { path: string } }, draft: SemanticContent): YOp {
  const nodePath = getParentPath(op.unset.path);
  const slotKey = getNodeKey(op.unset.path);
  const node = nodePath ? findNode(draft.trees, nodePath) : undefined;
  const oldValue = node?.slots[slotKey] ?? '';
  return { set: { path: op.unset.path, value: oldValue, source: '', from: '' } };
}

function invertAdd(op: { add: { parent: string; node: Record<string, unknown> } }): YOp {
  const nodeKey = Object.keys(op.add.node)[0];
  const path = op.add.parent ? `${op.add.parent}/${nodeKey}` : nodeKey;
  return { drop: { path } };
}

function invertDrop(op: { drop: { path: string } }, draft: SemanticContent): YOp {
  const node = findNode(draft.trees, op.drop.path);
  const parentPath = getParentPath(op.drop.path);
  if (!node) {
    // Node doesn't exist — inverse is a no-op add of empty node
    const key = getNodeKey(op.drop.path);
    return { add: { parent: parentPath, node: { [key]: {} }, source: {}, from: '' } };
  }
  // Reconstruct the node data for re-adding
  const nodeData = treeNodeToYamlMap(node);
  return {
    add: {
      parent: parentPath,
      node: { [node.key]: nodeData },
      source: node.slot_quotes ?? {},
      from: node.source ?? '',
    },
  };
}

function invertRename(op: { rename: { path: string; to: string } }): YOp {
  const parentPath = getParentPath(op.rename.path);
  const oldKey = getNodeKey(op.rename.path);
  const newPath = parentPath ? `${parentPath}/${op.rename.to}` : op.rename.to;
  return { rename: { path: newPath, to: oldKey } };
}

function invertClone(op: { clone: { path: string; to: string } }, draft: SemanticContent): YOp {
  const sourceNode = findNode(draft.trees, op.clone.path);
  const sourceKey = sourceNode?.key ?? getNodeKey(op.clone.path);
  const clonedPath = op.clone.to ? `${op.clone.to}/${sourceKey}` : sourceKey;
  return { drop: { path: clonedPath } };
}

function invertMove(op: { move: { path: string; to: string } }): YOp {
  return { move: { path: op.move.to, to: op.move.path } };
}

function invertRelate(op: { relate: { from: string; to: string; type: string } }): YOp {
  // biome-ignore lint/suspicious/noExplicitAny: RelationType has two incompatible definitions in core
  return { unrelate: { from: op.relate.from, to: op.relate.to, type: op.relate.type as any } };
}

function invertUnrelate(op: { unrelate: { from: string; to: string; type: string } }): YOp {
  // biome-ignore lint/suspicious/noExplicitAny: RelationType has two incompatible definitions in core
  return { relate: { from: op.unrelate.from, to: op.unrelate.to, type: op.unrelate.type as any } };
}

// ── Context-based inverses ──

function invertNest(
  op: { nest: { paths: string[]; under: string } },
  draft: SemanticContent
): ContextInverse {
  const snapshot = op.nest.paths
    .map((p) => findNode(draft.trees, p))
    .filter((n): n is TreeNode => n !== undefined)
    .map(deepCloneNode);
  return { _context: { type: 'nest', snapshot, originalOp: op } };
}

function invertSplit(
  op: { split: { path: string; into: Record<string, string[]> } },
  draft: SemanticContent
): ContextInverse {
  const node = findNode(draft.trees, op.split.path);
  const snapshot = node ? [deepCloneNode(node)] : [];
  return { _context: { type: 'split', snapshot, originalOp: op } };
}

function invertFold(op: { fold: { path: string } }, draft: SemanticContent): ContextInverse {
  const node = findNode(draft.trees, op.fold.path);
  const snapshot = node ? [deepCloneNode(node)] : [];
  return { _context: { type: 'fold', snapshot, originalOp: op } };
}

function invertMerge(
  op: { merge: { paths: string[]; into: string } },
  draft: SemanticContent
): ContextInverse {
  const snapshot = op.merge.paths
    .map((p) => findNode(draft.trees, p))
    .filter((n): n is TreeNode => n !== undefined)
    .map(deepCloneNode);
  return { _context: { type: 'merge', snapshot, originalOp: op } };
}

// ── Helpers ──

function deepCloneNode(node: TreeNode): TreeNode {
  return {
    key: node.key,
    slots: structuredClone(node.slots),
    children: node.children.map(deepCloneNode),
    ...(node.slot_quotes ? { slot_quotes: { ...node.slot_quotes } } : {}),
    ...(node.source !== undefined ? { source: node.source } : {}),
    ...(node.confidence !== undefined ? { confidence: node.confidence } : {}),
  };
}

/** Convert TreeNode slots back to the YAML map format used by AddOp.node */
function treeNodeToYamlMap(node: TreeNode): Record<string, unknown> {
  const result: Record<string, unknown> = { ...node.slots };
  for (const child of node.children) {
    result[child.key] = treeNodeToYamlMap(child);
  }
  return result;
}
