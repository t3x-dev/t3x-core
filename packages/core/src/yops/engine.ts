/**
 * YOps Engine — Apply YAML Operations to SemanticContent
 *
 * Pure function: deep clones input, applies ops sequentially, stops at first error.
 */

import type { Relation, SemanticContent, TreeNode } from '../semantic/types';
import { yamlToTree } from '../semantic/tree';
import {
  cloneTree,
  findNode,
  findParentAndChild,
  getNodeKey,
  getParentPath,
  hasRootKey,
  hasSiblingKey,
  isValidKey,
  removeRelationsForPath,
  updateRelationPaths,
} from './helpers';
import type {
  AddOp,
  CloneOp,
  DropOp,
  FoldOp,
  MergeOp,
  MoveOp,
  NestOp,
  RelateOp,
  RenameOp,
  SetOp,
  SplitOp,
  UnrelateOp,
  UnsetOp,
  YOp,
  YOpsError,
  YOpsErrorCode,
  YOpsResult,
} from './types';
import { YOPS_ERRORS } from './types';

// ── Public API ──

export function applyYOps(content: SemanticContent, ops: YOp[]): YOpsResult {
  // Deep clone to avoid mutation
  const trees = content.trees.map(cloneTree);
  let relations: Relation[] = content.relations.map((r) => ({ ...r }));

  const setRelations = (newRels: Relation[]) => {
    relations = newRels;
  };

  for (let i = 0; i < ops.length; i++) {
    const err = executeOp(trees, relations, ops[i], setRelations, i);
    if (err) {
      return { ok: false, trees, relations, applied: i, error: err };
    }
  }

  return { ok: true, trees, relations, applied: ops.length };
}

// ── Dispatcher ──

function executeOp(
  trees: TreeNode[],
  relations: Relation[],
  op: YOp,
  setRelations: (r: Relation[]) => void,
  index: number,
): YOpsError | null {
  if ('set' in op) return execSet(trees, relations, op.set, setRelations, index);
  if ('unset' in op) return execUnset(trees, op.unset, index);
  if ('add' in op) return execAdd(trees, op.add, index);
  if ('drop' in op) return execDrop(trees, relations, op.drop, setRelations, index);
  if ('rename' in op) return execRename(trees, relations, op.rename, setRelations, index);
  if ('clone' in op) return execClone(trees, op.clone, index);
  if ('move' in op) return execMove(trees, relations, op.move, setRelations, index);
  if ('nest' in op) return execNest(trees, relations, op.nest, setRelations, index);
  if ('split' in op) return execSplit(trees, relations, op.split, setRelations, index);
  if ('fold' in op) return execFold(trees, relations, op.fold, setRelations, index);
  if ('merge' in op) return execMerge(trees, relations, op.merge, setRelations, index);
  if ('relate' in op) return execRelate(trees, relations, op.relate, setRelations, index);
  if ('unrelate' in op) return execUnrelate(relations, op.unrelate, setRelations, index);
  return err(YOPS_ERRORS.NODE_NOT_FOUND, 'Unknown operation', index);
}

// ── Helpers ──

function err(code: YOpsErrorCode, message: string, op_index: number): YOpsError {
  return { code, message, op_index };
}

// ── set ──

function execSet(
  trees: TreeNode[],
  _relations: Relation[],
  op: SetOp,
  _setRelations: (r: Relation[]) => void,
  index: number,
): YOpsError | null {
  // Path format: node_path/slot_key
  const nodePath = getParentPath(op.path);
  const slotKey = getNodeKey(op.path);

  if (!nodePath && !slotKey) {
    return err(YOPS_ERRORS.NODE_NOT_FOUND, `Invalid path: ${op.path}`, index);
  }

  // If path has no slash, it means root-level slot — but that would mean setting
  // a slot on... what? The path format is "node_path/slot_key", so single segment
  // means the node is a root node and we need to look differently.
  // Actually: "trip/budget" means node "trip", slot "budget".
  // "budget" alone has no node portion — this is invalid for set.
  // But let's handle it: if nodePath is empty, the path IS the slot key on... no node.
  // Per the spec, "parent node must exist", so single-segment path means we need
  // the node at getParentPath (which is '') — that's the root level, not a node.
  // We need at least one slash: node/slot.

  const node = nodePath ? findNode(trees, nodePath) : undefined;
  if (!node) {
    return err(YOPS_ERRORS.NODE_NOT_FOUND, `Node not found: ${nodePath || op.path}`, index);
  }

  node.slots[slotKey] = op.value;

  // Set source quote
  if (!node.slot_quotes) node.slot_quotes = {};
  node.slot_quotes[slotKey] = op.source;

  // Set confidence if provided
  if (op.confidence !== undefined) {
    node.confidence = op.confidence;
  }

  // Store 'from' in node source
  node.source = op.from;

  return null;
}

// ── unset ──

function execUnset(
  trees: TreeNode[],
  op: UnsetOp,
  index: number,
): YOpsError | null {
  const nodePath = getParentPath(op.path);
  const slotKey = getNodeKey(op.path);

  const node = nodePath ? findNode(trees, nodePath) : undefined;
  if (!node) {
    // Idempotent: missing node = no-op (just like missing slot = no-op)
    return null;
  }

  // Idempotent: no-op if slot already absent
  delete node.slots[slotKey];
  if (node.slot_quotes) {
    delete node.slot_quotes[slotKey];
  }

  return null;
}

/**
 * Recursively distribute slot_quotes to a node and its children by dot-path matching.
 * Same algorithm as applyMetadata() in yopsParser.ts.
 *
 * Example: source = { "duration": "seven days", "best_visit_times.fall": "Fall (Sep-Oct)" }
 * → root node gets slot_quotes.duration = "seven days"
 * → child "best_visit_times" gets slot_quotes.fall = "Fall (Sep-Oct)"
 */
function distributeSlotQuotes(
  node: TreeNode,
  source: Record<string, string>,
  prefix: string,
): void {
  const nodeQuotes: Record<string, string> = {};
  for (const [quotePath, quoteValue] of Object.entries(source)) {
    const segments = quotePath.split('.');
    if (prefix === '') {
      if (segments.length === 1 && segments[0] in node.slots) {
        nodeQuotes[segments[0]] = quoteValue;
      }
    } else {
      const prefixSegments = prefix.split('.');
      if (
        segments.length === prefixSegments.length + 1 &&
        segments.slice(0, prefixSegments.length).join('.') === prefix &&
        segments[segments.length - 1] in node.slots
      ) {
        nodeQuotes[segments[segments.length - 1]] = quoteValue;
      }
    }
  }
  if (Object.keys(nodeQuotes).length > 0) {
    node.slot_quotes = { ...node.slot_quotes, ...nodeQuotes };
  }

  for (const child of node.children) {
    const childPrefix = prefix ? `${prefix}.${child.key}` : child.key;
    distributeSlotQuotes(child, source, childPrefix);
  }
}

// ── add ──

function execAdd(
  trees: TreeNode[],
  op: AddOp,
  index: number,
): YOpsError | null {
  const keys = Object.keys(op.node);
  if (keys.length !== 1) {
    return err(YOPS_ERRORS.INVALID_KEY, 'node must have exactly one top-level key', index);
  }

  const nodeKey = keys[0];
  if (!isValidKey(nodeKey)) {
    return err(YOPS_ERRORS.INVALID_KEY, `Invalid key: ${nodeKey}`, index);
  }

  // Build tree node from YAML map
  const newNode = yamlToTree(nodeKey, op.node[nodeKey]);

  // Distribute source quotes recursively to children by dot-path matching
  if (Object.keys(op.source).length > 0) {
    distributeSlotQuotes(newNode, op.source, '');
  }

  if (op.from) newNode.source = op.from;
  if (op.confidence !== undefined) newNode.confidence = op.confidence;

  if (op.parent === '') {
    // Root level
    if (hasRootKey(trees, nodeKey)) {
      return err(YOPS_ERRORS.DUPLICATE_KEY, `Root key already exists: ${nodeKey}`, index);
    }
    trees.push(newNode);
  } else {
    const parent = findNode(trees, op.parent);
    if (!parent) {
      return err(YOPS_ERRORS.PARENT_NOT_FOUND, `Parent not found: ${op.parent}`, index);
    }
    if (hasSiblingKey(parent, nodeKey)) {
      return err(YOPS_ERRORS.DUPLICATE_KEY, `Sibling key already exists: ${nodeKey}`, index);
    }
    parent.children.push(newNode);
  }

  return null;
}

// ── drop ──

function execDrop(
  trees: TreeNode[],
  relations: Relation[],
  op: DropOp,
  setRelations: (r: Relation[]) => void,
  index: number,
): YOpsError | null {
  const info = findParentAndChild(trees, op.path);
  if (!info.child) {
    return err(YOPS_ERRORS.NODE_NOT_FOUND, `Node not found: ${op.path}`, index);
  }

  if (info.isRoot) {
    trees.splice(info.childIndex, 1);
  } else if (info.parent) {
    info.parent.children.splice(info.childIndex, 1);
  }

  // Clean up relations
  setRelations(removeRelationsForPath(relations, op.path));

  return null;
}

// ── rename ──

function execRename(
  trees: TreeNode[],
  relations: Relation[],
  op: RenameOp,
  setRelations: (r: Relation[]) => void,
  index: number,
): YOpsError | null {
  if (!isValidKey(op.to)) {
    return err(YOPS_ERRORS.INVALID_KEY, `Invalid key: ${op.to}`, index);
  }

  const info = findParentAndChild(trees, op.path);
  if (!info.child) {
    return err(YOPS_ERRORS.NODE_NOT_FOUND, `Node not found: ${op.path}`, index);
  }

  // Check sibling conflict
  if (info.isRoot) {
    if (trees.some((t) => t !== info.child && t.key === op.to)) {
      return err(YOPS_ERRORS.DUPLICATE_KEY, `Root key already exists: ${op.to}`, index);
    }
  } else if (info.parent) {
    if (info.parent.children.some((c) => c !== info.child && c.key === op.to)) {
      return err(YOPS_ERRORS.DUPLICATE_KEY, `Sibling key already exists: ${op.to}`, index);
    }
  }

  // Build new path
  const parentPath = getParentPath(op.path);
  const newPath = parentPath ? `${parentPath}/${op.to}` : op.to;

  info.child.key = op.to;
  setRelations(updateRelationPaths(relations, op.path, newPath));

  return null;
}

// ── clone ──

function execClone(
  trees: TreeNode[],
  op: CloneOp,
  index: number,
): YOpsError | null {
  const source = findNode(trees, op.path);
  if (!source) {
    return err(YOPS_ERRORS.NODE_NOT_FOUND, `Source not found: ${op.path}`, index);
  }

  const copy = cloneTree(source);

  if (op.to === '') {
    // Clone to root
    if (hasRootKey(trees, copy.key)) {
      return err(YOPS_ERRORS.DUPLICATE_KEY, `Root key already exists: ${copy.key}`, index);
    }
    trees.push(copy);
  } else {
    const targetParent = findNode(trees, op.to);
    if (!targetParent) {
      return err(YOPS_ERRORS.PARENT_NOT_FOUND, `Target parent not found: ${op.to}`, index);
    }
    if (hasSiblingKey(targetParent, copy.key)) {
      return err(YOPS_ERRORS.DUPLICATE_KEY, `Sibling key already exists: ${copy.key}`, index);
    }
    targetParent.children.push(copy);
  }

  return null;
}

// ── move ──

function execMove(
  trees: TreeNode[],
  relations: Relation[],
  op: MoveOp,
  setRelations: (r: Relation[]) => void,
  index: number,
): YOpsError | null {
  // The "to" field is the full target path: new_parent/node_key
  // So the target parent is getParentPath(op.to) and target key is getNodeKey(op.to)
  const targetParentPath = getParentPath(op.to);
  const targetKey = getNodeKey(op.to);

  // Cycle check: cannot move into own subtree
  if (op.to === op.path || op.to.startsWith(op.path + '/')) {
    return err(YOPS_ERRORS.CYCLE_DETECTED, `Cannot move node into its own subtree`, index);
  }

  const info = findParentAndChild(trees, op.path);
  if (!info.child) {
    return err(YOPS_ERRORS.NODE_NOT_FOUND, `Source not found: ${op.path}`, index);
  }

  // Find or validate target parent
  if (targetParentPath === '') {
    // Moving to root level
    if (hasRootKey(trees, targetKey) && !(info.isRoot && info.child.key === targetKey)) {
      return err(YOPS_ERRORS.DUPLICATE_KEY, `Root key already exists: ${targetKey}`, index);
    }
  } else {
    const targetParent = findNode(trees, targetParentPath);
    if (!targetParent) {
      return err(YOPS_ERRORS.PARENT_NOT_FOUND, `Target parent not found: ${targetParentPath}`, index);
    }
    if (hasSiblingKey(targetParent, targetKey)) {
      return err(YOPS_ERRORS.DUPLICATE_KEY, `Sibling key already exists: ${targetKey}`, index);
    }
  }

  // Detach from source
  if (info.isRoot) {
    trees.splice(info.childIndex, 1);
  } else if (info.parent) {
    info.parent.children.splice(info.childIndex, 1);
  }

  // Rename key if needed
  info.child.key = targetKey;

  // Attach to target
  if (targetParentPath === '') {
    trees.push(info.child);
  } else {
    const targetParent = findNode(trees, targetParentPath)!;
    targetParent.children.push(info.child);
  }

  // Update relations
  setRelations(updateRelationPaths(relations, op.path, op.to));

  return null;
}

// ── nest ──

function execNest(
  trees: TreeNode[],
  relations: Relation[],
  op: NestOp,
  setRelations: (r: Relation[]) => void,
  index: number,
): YOpsError | null {
  if (!isValidKey(op.under)) {
    return err(YOPS_ERRORS.INVALID_KEY, `Invalid key: ${op.under}`, index);
  }

  // Validate all paths exist and are siblings
  const parentPaths = op.paths.map(getParentPath);
  const uniqueParents = new Set(parentPaths);
  if (uniqueParents.size > 1) {
    return err(YOPS_ERRORS.NOT_SIBLINGS, 'All nodes must be siblings', index);
  }

  const commonParentPath = parentPaths[0];

  // Check nodes exist
  const nodes: TreeNode[] = [];
  for (const p of op.paths) {
    const node = findNode(trees, p);
    if (!node) {
      return err(YOPS_ERRORS.NODE_NOT_FOUND, `Node not found: ${p}`, index);
    }
    nodes.push(node);
  }

  // Check no sibling conflict with wrapper key
  if (commonParentPath === '') {
    if (hasRootKey(trees, op.under) && !nodes.some((n) => n.key === op.under)) {
      return err(YOPS_ERRORS.DUPLICATE_KEY, `Root key already exists: ${op.under}`, index);
    }
  } else {
    const parent = findNode(trees, commonParentPath)!;
    const movedKeys = new Set(nodes.map((n) => n.key));
    if (parent.children.some((c) => c.key === op.under && !movedKeys.has(c.key))) {
      return err(YOPS_ERRORS.DUPLICATE_KEY, `Sibling key already exists: ${op.under}`, index);
    }
  }

  // Create wrapper node
  const wrapper: TreeNode = {
    key: op.under,
    slots: {},
    children: [],
  };

  // Detach nodes and move them under wrapper
  const keysToMove = new Set(op.paths.map(getNodeKey));
  if (commonParentPath === '') {
    // Root level
    for (let i = trees.length - 1; i >= 0; i--) {
      if (keysToMove.has(trees[i].key)) {
        wrapper.children.unshift(trees[i]);
        trees.splice(i, 1);
      }
    }
    trees.push(wrapper);
  } else {
    const parent = findNode(trees, commonParentPath)!;
    for (let i = parent.children.length - 1; i >= 0; i--) {
      if (keysToMove.has(parent.children[i].key)) {
        wrapper.children.unshift(parent.children[i]);
        parent.children.splice(i, 1);
      }
    }
    parent.children.push(wrapper);
  }

  // Update relations for each moved node
  const wrapperPath = commonParentPath ? `${commonParentPath}/${op.under}` : op.under;
  let updatedRels = [...relations];
  for (const p of op.paths) {
    const key = getNodeKey(p);
    const newPath = `${wrapperPath}/${key}`;
    updatedRels = updateRelationPaths(updatedRels, p, newPath);
  }
  setRelations(updatedRels);

  return null;
}

// ── split ──

function execSplit(
  trees: TreeNode[],
  _relations: Relation[],
  op: SplitOp,
  _setRelations: (r: Relation[]) => void,
  index: number,
): YOpsError | null {
  const node = findNode(trees, op.path);
  if (!node) {
    return err(YOPS_ERRORS.NODE_NOT_FOUND, `Node not found: ${op.path}`, index);
  }

  // Validate child keys
  for (const childKey of Object.keys(op.into)) {
    if (!isValidKey(childKey)) {
      return err(YOPS_ERRORS.INVALID_KEY, `Invalid key: ${childKey}`, index);
    }
  }

  // Validate all slot names exist and no duplicates across children
  const seenSlots = new Set<string>();
  for (const [childKey, slotNames] of Object.entries(op.into)) {
    for (const slot of slotNames) {
      if (!(slot in node.slots)) {
        return err(YOPS_ERRORS.SLOT_NOT_FOUND, `Slot not found: ${slot}`, index);
      }
      if (seenSlots.has(slot)) {
        return err(YOPS_ERRORS.DUPLICATE_SLOT, `Slot in multiple children: ${slot}`, index);
      }
      seenSlots.add(slot);
    }
    // Check no existing child with same key
    if (node.children.some((c) => c.key === childKey)) {
      return err(YOPS_ERRORS.DUPLICATE_KEY, `Child key already exists: ${childKey}`, index);
    }
  }

  // Create child nodes
  for (const [childKey, slotNames] of Object.entries(op.into)) {
    const childSlots: Record<string, unknown> = {};
    const childQuotes: Record<string, string> = {};

    for (const slot of slotNames) {
      childSlots[slot] = node.slots[slot];
      if (node.slot_quotes?.[slot]) {
        childQuotes[slot] = node.slot_quotes[slot];
      }
      delete node.slots[slot];
      if (node.slot_quotes) {
        delete node.slot_quotes[slot];
      }
    }

    const child: TreeNode = {
      key: childKey,
      slots: childSlots as TreeNode['slots'],
      children: [],
    };
    if (Object.keys(childQuotes).length > 0) {
      child.slot_quotes = childQuotes;
    }

    node.children.push(child);
  }

  return null;
}

// ── fold ──

function execFold(
  trees: TreeNode[],
  relations: Relation[],
  op: FoldOp,
  setRelations: (r: Relation[]) => void,
  index: number,
): YOpsError | null {
  const node = findNode(trees, op.path);
  if (!node) {
    return err(YOPS_ERRORS.NODE_NOT_FOUND, `Node not found: ${op.path}`, index);
  }

  if (node.children.length !== 1 || Object.keys(node.slots).length > 0) {
    return err(YOPS_ERRORS.NOT_FOLDABLE, `Node must have exactly 1 child and no slots`, index);
  }

  const child = node.children[0];
  const info = findParentAndChild(trees, op.path);

  if (info.isRoot) {
    trees[info.childIndex] = child;
  } else if (info.parent) {
    info.parent.children[info.childIndex] = child;
  }

  // Update relations: old child path -> new promoted path
  const childOldPath = `${op.path}/${child.key}`;
  const parentPath = getParentPath(op.path);
  const childNewPath = parentPath ? `${parentPath}/${child.key}` : child.key;
  let updatedRels = updateRelationPaths(relations, childOldPath, childNewPath);

  // Remove dangling relations that still reference the folded wrapper node
  updatedRels = removeRelationsForPath(updatedRels, op.path);

  setRelations(updatedRels);

  return null;
}

// ── merge ──

function execMerge(
  trees: TreeNode[],
  relations: Relation[],
  op: MergeOp,
  setRelations: (r: Relation[]) => void,
  index: number,
): YOpsError | null {
  if (!isValidKey(op.into)) {
    return err(YOPS_ERRORS.INVALID_KEY, `Invalid key: ${op.into}`, index);
  }

  // Validate all paths exist and are siblings
  const parentPaths = op.paths.map(getParentPath);
  const uniqueParents = new Set(parentPaths);
  if (uniqueParents.size > 1) {
    return err(YOPS_ERRORS.NOT_SIBLINGS, 'All nodes must be siblings', index);
  }

  const commonParentPath = parentPaths[0];
  const nodesToMerge: TreeNode[] = [];
  for (const p of op.paths) {
    const node = findNode(trees, p);
    if (!node) {
      return err(YOPS_ERRORS.NODE_NOT_FOUND, `Node not found: ${p}`, index);
    }
    nodesToMerge.push(node);
  }

  // Combine slots (last wins), children, quotes
  const mergedSlots: Record<string, unknown> = {};
  const mergedQuotes: Record<string, string> = {};
  const mergedChildren: TreeNode[] = [];
  let minConfidence: number | undefined;

  for (const node of nodesToMerge) {
    Object.assign(mergedSlots, node.slots);
    if (node.slot_quotes) Object.assign(mergedQuotes, node.slot_quotes);
    // Children: dedup by key with "last wins" (consistent with slot conflict resolution)
    for (const child of node.children) {
      const existingIdx = mergedChildren.findIndex((c) => c.key === child.key);
      if (existingIdx >= 0) {
        mergedChildren[existingIdx] = child;
      } else {
        mergedChildren.push(child);
      }
    }
    if (node.confidence !== undefined) {
      minConfidence = minConfidence === undefined
        ? node.confidence
        : Math.min(minConfidence, node.confidence);
    }
  }

  const mergedNode: TreeNode = {
    key: op.into,
    slots: mergedSlots as TreeNode['slots'],
    children: mergedChildren,
  };
  if (Object.keys(mergedQuotes).length > 0) mergedNode.slot_quotes = mergedQuotes;
  if (minConfidence !== undefined) mergedNode.confidence = minConfidence;

  // Remove original nodes
  const keysToRemove = new Set(op.paths.map(getNodeKey));
  if (commonParentPath === '') {
    for (let i = trees.length - 1; i >= 0; i--) {
      if (keysToRemove.has(trees[i].key)) {
        trees.splice(i, 1);
      }
    }
    trees.push(mergedNode);
  } else {
    const parent = findNode(trees, commonParentPath)!;
    for (let i = parent.children.length - 1; i >= 0; i--) {
      if (keysToRemove.has(parent.children[i].key)) {
        parent.children.splice(i, 1);
      }
    }
    parent.children.push(mergedNode);
  }

  // Update relations
  const mergedPath = commonParentPath ? `${commonParentPath}/${op.into}` : op.into;
  let updatedRels = [...relations];
  for (const p of op.paths) {
    updatedRels = updateRelationPaths(updatedRels, p, mergedPath);
  }
  setRelations(updatedRels);

  return null;
}

// ── relate ──

function execRelate(
  trees: TreeNode[],
  relations: Relation[],
  op: RelateOp,
  setRelations: (r: Relation[]) => void,
  index: number,
): YOpsError | null {
  if (!findNode(trees, op.from)) {
    return err(YOPS_ERRORS.NODE_NOT_FOUND, `Node not found: ${op.from}`, index);
  }
  if (!findNode(trees, op.to)) {
    return err(YOPS_ERRORS.NODE_NOT_FOUND, `Node not found: ${op.to}`, index);
  }
  if (op.from === op.to) {
    return err(YOPS_ERRORS.SELF_RELATION, 'Cannot create self-relation', index);
  }

  // Check duplicate
  if (relations.some((r) => r.from === op.from && r.to === op.to && r.type === op.type)) {
    return err(YOPS_ERRORS.DUPLICATE_RELATION, 'Relation already exists', index);
  }

  // Cycle check for causes/follows
  if (op.type === 'causes' || op.type === 'follows') {
    if (hasCycle(relations, op.to, op.from, op.type)) {
      return err(YOPS_ERRORS.CYCLE_DETECTED, `Would create cycle in ${op.type} relations`, index);
    }
  }

  const newRel: Relation = {
    from: op.from,
    to: op.to,
    type: op.type,
  };
  if (op.confidence !== undefined) newRel.confidence = op.confidence;

  setRelations([...relations, newRel]);
  return null;
}

/** Check if adding an edge from -> to would create a cycle (DFS). */
function hasCycle(
  relations: Relation[],
  from: string,
  to: string,
  type: string,
): boolean {
  // Check if there's already a path from 'to' back to 'from' via same-type relations
  // (which means adding from->to would close a cycle)
  const visited = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const r of relations) {
      if (r.from === current && r.type === type) {
        stack.push(r.to);
      }
    }
  }
  return false;
}

// ── unrelate ──

function execUnrelate(
  relations: Relation[],
  op: UnrelateOp,
  setRelations: (r: Relation[]) => void,
  _index: number,
): YOpsError | null {
  // Idempotent: no-op if not found
  setRelations(
    relations.filter(
      (r) => !(r.from === op.from && r.to === op.to && r.type === op.type),
    ),
  );
  return null;
}
