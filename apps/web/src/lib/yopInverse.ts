/**
 * yopInverse — Compute inverse YOp for undo
 *
 * Pure function. Given a YOp and the CURRENT draft (before the op is applied),
 * returns the inverse YOp that undoes the operation.
 *
 * 10 exact inverses + 3 context-based (nest/split/fold/merge).
 * Context-based inverses store pre-state in a _context property.
 * TODO(undo-redo): undo/redo stack management is deferred to a future PR.
 */

import type { SemanticContent, SlotValue, TreeNode, YOp } from '@t3x-dev/core';
import { findNode, getNodeKey, getParentPath } from '@t3x-dev/core';

/**
 * Runtime-enriched tree node shape.
 * The API still stores and returns `source` and `slot_quotes` per node in the DB;
 * these fields are present at runtime even though public TreeNode does not declare them.
 * TODO(follow-up): migrate source tracing to use sourceIndex instead of slot_quotes.
 */
type EnrichedTreeNode = TreeNode & {
  source?: string;
  slot_quotes?: Record<string, string>;
};

/** Inverse result — either a normal YOp or a context-carrying marker */
export type InverseResult = YOp | ContextInverse;

export interface ContextInverse {
  _context: {
    type: 'nest' | 'split' | 'fold' | 'merge' | 'populate';
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
  // biome-ignore lint/suspicious/noExplicitAny: YValue includes null but SlotValue does not; bridging with any
  const a = op as any;
  if ('set' in op) return invertSet(a, draft);
  if ('unset' in op) return invertUnset(a, draft);
  if ('define' in op) return invertDefine(a);
  if ('populate' in op) return invertPopulate(a);
  if ('drop' in op) return invertDrop(a, draft);
  if ('rename' in op) return invertRename(a);
  if ('clone' in op) return invertClone(a, draft);
  if ('move' in op) return invertMove(a);
  if ('relate' in op) return invertRelate(a);
  if ('unrelate' in op) return invertUnrelate(a);
  // Context-based: nest, split, fold, merge
  if ('nest' in op) return invertNest(a, draft);
  if ('split' in op) return invertSplit(a, draft);
  if ('fold' in op) return invertFold(a, draft);
  if ('merge' in op) return invertMerge(a, draft);
  // Fallback (should never hit)
  return op;
}

// ── Exact inverses ──

function invertSet(
  op: { set: { path: string; value: SlotValue } },
  draft: SemanticContent
): YOp {
  const nodePath = getParentPath(op.set.path);
  const slotKey = getNodeKey(op.set.path);
  const node = nodePath ? findNode(draft.trees, nodePath) : undefined;
  if (node && slotKey in node.slots) {
    // Existing slot → set back to old value
    return { set: { path: op.set.path, value: node.slots[slotKey] } };
  }
  // New slot → unset
  return { unset: { path: op.set.path } };
}

function invertUnset(op: { unset: { path: string } }, draft: SemanticContent): YOp {
  const nodePath = getParentPath(op.unset.path);
  const slotKey = getNodeKey(op.unset.path);
  const node = nodePath ? findNode(draft.trees, nodePath) : undefined;
  const oldValue = node?.slots[slotKey] ?? '';
  return { set: { path: op.unset.path, value: oldValue } };
}

function invertDefine(op: { define: { path: string } }): YOp {
  return { drop: { path: op.define.path } };
}

function invertPopulate(op: { populate: { path: string; values: Record<string, SlotValue> } }): ContextInverse {
  // Inverse of populate requires multiple unset ops — use context-based inverse
  return {
    _context: {
      type: 'populate',
      snapshot: [],
      originalOp: op as YOp,
    },
  };
}

function invertDrop(op: { drop: { path: string } }, draft: SemanticContent): ContextInverse {
  const node = findNode(draft.trees, op.drop.path);
  const snapshot = node ? [deepCloneNode(node)] : [];
  return {
    _context: {
      type: 'nest', // Re-use 'nest' type — restoring a dropped subtree
      snapshot,
      originalOp: op as YOp,
    },
  };
}

function invertRename(op: { rename: { path: string; to: string } }): YOp {
  const parentPath = getParentPath(op.rename.path);
  const oldKey = getNodeKey(op.rename.path);
  const newPath = parentPath ? `${parentPath}/${op.rename.to}` : op.rename.to;
  return { rename: { path: newPath, to: oldKey } };
}

function invertClone(op: { clone: { from: string; to: string } }, draft: SemanticContent): YOp {
  const sourceNode = findNode(draft.trees, op.clone.from);
  const sourceKey = sourceNode?.key ?? getNodeKey(op.clone.from);
  const clonedPath = op.clone.to ? `${op.clone.to}/${sourceKey}` : sourceKey;
  return { drop: { path: clonedPath } };
}

function invertMove(op: { move: { from: string; to: string } }): YOp {
  return { move: { from: op.move.to, to: op.move.from } };
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
  op: { nest: { path: string; keys: string[]; under: string } },
  draft: SemanticContent
): ContextInverse {
  const snapshot = op.nest.keys
    .map((k) => findNode(draft.trees, `${op.nest.path}/${k}`))
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
  op: { merge: { path: string; keys: string[]; into: string } },
  draft: SemanticContent
): ContextInverse {
  const snapshot = op.merge.keys
    .map((k) => findNode(draft.trees, `${op.merge.path}/${k}`))
    .filter((n): n is TreeNode => n !== undefined)
    .map(deepCloneNode);
  return { _context: { type: 'merge', snapshot, originalOp: op } };
}

// ── Helpers ──

function deepCloneNode(node: TreeNode): TreeNode {
  const enriched = node as EnrichedTreeNode;
  const clone: EnrichedTreeNode = {
    key: enriched.key,
    slots: structuredClone(enriched.slots),
    children: (enriched.children ?? []).map(deepCloneNode) as EnrichedTreeNode[],
  };
  if (enriched.slot_quotes) clone.slot_quotes = { ...enriched.slot_quotes };
  if (enriched.source !== undefined) clone.source = enriched.source;
  return clone;
}

