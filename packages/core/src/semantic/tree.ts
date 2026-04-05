import type { FlatNode, SlotValue, TreeNode } from './types';

/**
 * Flatten a TreeNode into a FlatNode[] with path-based IDs.
 *
 * Each object node becomes a FlatNode. The node ID is the full path
 * from root using "/" as separator. Leaf slot values go into
 * node.slots; child object nodes become separate flat nodes.
 */
export function flattenTree(tree: TreeNode): FlatNode[] {
  const nodes: FlatNode[] = [];
  flattenNode(tree, '', nodes);
  return nodes;
}

/**
 * Flatten multiple trees into a single FlatNode[] array.
 * Each tree produces flat nodes with path-based IDs rooted at its key.
 */
export function flattenTrees(trees: TreeNode[]): FlatNode[] {
  const nodes: FlatNode[] = [];
  for (const tree of trees) {
    flattenNode(tree, '', nodes);
  }
  return nodes;
}

function flattenNode(node: TreeNode, parentPath: string, out: FlatNode[]): void {
  const path = parentPath ? `${parentPath}/${node.key}` : node.key;

  const flat: FlatNode = {
    id: path,
    type: node.key,
    slots: { ...node.slots },
  };
  if (node.source) flat.source = node.source;
  if (node.confidence !== undefined) flat.confidence = node.confidence;

  out.push(flat);

  for (const child of node.children) {
    flattenNode(child, path, out);
  }
}

/**
 * Reconstruct a TreeNode from a flat FlatNode[] with path-based IDs.
 *
 * Nodes must be from the same tree (share a common root path segment).
 * The root node has no "/" in its ID.
 */
export function unflattenToTree(flatNodes: FlatNode[]): TreeNode {
  // Sort by path depth (root first)
  const sorted = [...flatNodes].sort((a, b) => {
    const depthA = a.id.split('/').length;
    const depthB = b.id.split('/').length;
    return depthA - depthB;
  });

  if (sorted.length === 0) {
    throw new Error('Cannot unflatten empty flat node list');
  }

  const root = sorted[0];
  const rootNode: TreeNode = {
    key: root.type,
    slots: { ...root.slots },
    children: [],
    ...(root.source ? { source: root.source } : {}),
    ...(root.confidence !== undefined ? { confidence: root.confidence } : {}),
  };

  // Map path → TreeNode for parent lookups
  const nodeMap = new Map<string, TreeNode>();
  nodeMap.set(root.id, rootNode);

  for (let i = 1; i < sorted.length; i++) {
    const flatNode = sorted[i];
    const segments = flatNode.id.split('/');
    const parentPath = segments.slice(0, -1).join('/');

    const node: TreeNode = {
      key: flatNode.type,
      slots: { ...flatNode.slots },
      children: [],
      ...(flatNode.source ? { source: flatNode.source } : {}),
      ...(flatNode.confidence !== undefined ? { confidence: flatNode.confidence } : {}),
    };

    const parent = nodeMap.get(parentPath);
    if (parent) {
      parent.children.push(node);
    }
    nodeMap.set(flatNode.id, node);
  }

  return rootNode;
}

/**
 * Reconstruct multiple TreeNodes from a flat FlatNode[] array.
 * Groups nodes by their root path segment, then unflattens each group.
 */
export function unflattenToTrees(flatNodes: FlatNode[]): TreeNode[] {
  if (flatNodes.length === 0) return [];

  // Group nodes by root path segment (first segment of the ID)
  const groups = new Map<string, FlatNode[]>();
  for (const node of flatNodes) {
    const rootKey = node.id.split('/')[0];
    let group = groups.get(rootKey);
    if (!group) {
      group = [];
      groups.set(rootKey, group);
    }
    group.push(node);
  }

  // Unflatten each group into a tree
  const trees: TreeNode[] = [];
  for (const group of groups.values()) {
    trees.push(unflattenToTree(group));
  }
  return trees;
}

/**
 * Build a slot_quotes dot-path from a flat node ID (tree path) and slot key.
 *
 * FlatNode ID: "hangzhou_trip/activity_plan" + slot key "activities"
 * → Quote path: "activity_plan.activities"
 *
 * The root node name is stripped -- paths are relative to the tree root.
 */
export function buildSlotQuotesPath(nodeId: string, slotKey: string): string {
  const segments = nodeId.split('/');
  if (segments.length === 1) {
    // Root node slot
    return slotKey;
  }
  // Drop root, join remaining with ".", append slot key
  return [...segments.slice(1), slotKey].join('.');
}

/**
 * Resolve a slot_quotes dot-path back to flat node ID + slot key.
 *
 * Quote path: "activity_plan.activities" + root: "hangzhou_trip"
 * → FlatNode ID: "hangzhou_trip/activity_plan", slot key: "activities"
 */
export function resolveSlotQuotesPath(
  quotePath: string,
  rootKey: string
): { nodeId: string; slotKey: string } {
  const segments = quotePath.split('.');
  const slotKey = segments[segments.length - 1];
  if (segments.length === 1) {
    return { nodeId: rootKey, slotKey };
  }
  const nodePath = [rootKey, ...segments.slice(0, -1)].join('/');
  return { nodeId: nodePath, slotKey };
}

/**
 * Collect all slot_quotes from a TreeNode into a flat map.
 * Keys use dot-path notation (relative to root).
 */
export function collectSlotQuotes(tree: TreeNode): Record<string, string> {
  const result: Record<string, string> = {};
  collectNodeQuotes(tree, '', result);
  return result;
}

function collectNodeQuotes(
  node: TreeNode,
  parentDotPath: string,
  result: Record<string, string>
): void {
  if (node.slot_quotes) {
    for (const [key, value] of Object.entries(node.slot_quotes)) {
      // Keys in node.slot_quotes are just the slot key name
      const fullPath = parentDotPath ? `${parentDotPath}.${key}` : key;
      result[fullPath] = value;
    }
  }
  for (const child of node.children) {
    const childPath = parentDotPath ? `${parentDotPath}.${child.key}` : child.key;
    collectNodeQuotes(child, childPath, result);
  }
}

/**
 * Validate tree depth does not exceed the given maximum.
 * Returns an error message if exceeded, or null if valid.
 */
export function validateTreeDepth(tree: TreeNode, maxDepth: number): string | null {
  return checkDepth(tree, 1, maxDepth);
}

function checkDepth(node: TreeNode, currentDepth: number, maxDepth: number): string | null {
  if (currentDepth > maxDepth) {
    return `Tree depth ${currentDepth} exceeds maximum ${maxDepth} at node "${node.key}"`;
  }
  for (const child of node.children) {
    const err = checkDepth(child, currentDepth + 1, maxDepth);
    if (err) return err;
  }
  return null;
}

/**
 * Known content blob types. An object with `_type` matching one of these
 * is stored as a slot value (not expanded into a child node).
 */
export const BLOB_TYPES = ['code', 'plot', 'table', 'image', 'video'] as const;
export type BlobType = (typeof BLOB_TYPES)[number];

/**
 * Check if a parsed object is a content blob (has `_type` field with known type).
 * Blobs are atomic meaning blocks — code snippets, charts, media —
 * stored as slot values rather than expanded into child nodes.
 */
export function isBlob(v: unknown): boolean {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj._type === 'string' && (BLOB_TYPES as readonly string[]).includes(obj._type);
}

/**
 * Convert a YAML-parsed object to a TreeNode.
 * At each level: scalar values, arrays, and blobs = slots; other objects = children.
 */
export function yamlToTree(key: string, value: unknown): TreeNode {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { key, slots: { [key]: value as SlotValue }, children: [] };
  }
  const obj = value as Record<string, unknown>;
  const slots: Record<string, SlotValue> = {};
  const children: TreeNode[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'object' && v !== null && !Array.isArray(v) && !isBlob(v)) {
      children.push(yamlToTree(k, v));
    } else {
      slots[k] = v as SlotValue;
    }
  }
  return { key, slots, children };
}
