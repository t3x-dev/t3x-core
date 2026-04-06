/**
 * TreeNode ↔ YValue Conversion
 *
 * Bridges T3X's TreeNode[] representation and the generic YValue type
 * consumed by the @t3x-dev/yops engine.
 *
 * ## Mapping Rules
 *
 * treesToYValue:
 *   - Each root TreeNode becomes a top-level key in a mapping.
 *   - Slots become direct child keys of the node mapping.
 *   - Children are recursively nested under their own keys.
 *   - Metadata (slot_quotes, source) is STRIPPED — the generic engine
 *     does not know about T3X-specific annotations.
 *
 * yvalueToTrees:
 *   - The inverse of treesToYValue.
 *   - Heuristic: a key's value is a child TreeNode if it is a non-null
 *     plain object (mapping). Scalars, arrays, booleans, numbers, and
 *     null are treated as slot values.
 *
 * ## Important Constraint
 *
 * T3X convention is that slots hold scalars or arrays — never plain
 * objects. If a slot value were a plain object it would be
 * indistinguishable from a child node during round-trip conversion.
 * Do NOT store plain-object slot values in TreeNode; use arrays or
 * scalars instead. If object-valued slots are needed in the future,
 * introduce a marker convention (e.g., a `__slot__` wrapper key).
 */

import type { YValue } from '@t3x-dev/yops';
import type { SlotValue, TreeNode } from '../semantic/types';

// ── Internal helpers ──

/** Returns true if v is a non-null plain object (i.e., a mapping). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Convert a single TreeNode to a YValue mapping. */
function treeNodeToYValue(node: TreeNode): Record<string, YValue> {
  const result: Record<string, YValue> = {};

  // Slots first (scalars / arrays)
  for (const [k, v] of Object.entries(node.slots)) {
    result[k] = v as YValue;
  }

  // Children nested under their own keys
  for (const child of node.children) {
    result[child.key] = treeNodeToYValue(child);
  }

  return result;
}

/** Convert a YValue mapping to a TreeNode with the given key. */
function yValueToTreeNode(key: string, value: YValue): TreeNode {
  if (!isPlainObject(value)) {
    // Leaf scalar passed directly — treated as a node with no slots or children.
    // In normal usage this should not happen because root values are always mappings.
    return { key, slots: {}, children: [] };
  }

  const slots: Record<string, SlotValue> = {};
  const children: TreeNode[] = [];

  for (const [k, v] of Object.entries(value)) {
    if (isPlainObject(v)) {
      // Non-null plain object → child node
      children.push(yValueToTreeNode(k, v as YValue));
    } else {
      // Scalar, array, boolean, number, null → slot value
      slots[k] = v as SlotValue;
    }
  }

  return { key, slots, children };
}

// ── Public API ──

/**
 * Convert T3X tree nodes to a generic YValue mapping.
 *
 * Each root tree becomes a top-level key. Metadata (slot_quotes, source)
 * is stripped because the generic YOps engine has no concept of it.
 *
 * Returns an empty mapping `{}` when trees is empty.
 */
export function treesToYValue(trees: TreeNode[]): YValue {
  const result: Record<string, YValue> = {};
  for (const tree of trees) {
    result[tree.key] = treeNodeToYValue(tree);
  }
  return result;
}

/**
 * Convert a YValue document back to T3X tree nodes.
 *
 * Heuristic: top-level keys of the mapping become root TreeNodes.
 * Within each node, plain-object values become child nodes and all
 * other values (scalars, arrays, null) become slot values.
 *
 * Returns an empty array when doc is not a plain object.
 */
export function yvalueToTrees(doc: YValue): TreeNode[] {
  if (!isPlainObject(doc)) {
    return [];
  }

  const trees: TreeNode[] = [];
  for (const [key, value] of Object.entries(doc)) {
    trees.push(yValueToTreeNode(key, value as YValue));
  }
  return trees;
}
