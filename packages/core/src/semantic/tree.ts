import type { Frame, SemanticContent, TreeNode } from './types';

/**
 * Detect whether a SemanticContent uses tree-native format.
 */
export function isTreeNative(content: SemanticContent): boolean {
  return content.tree !== undefined;
}

/**
 * Flatten a TreeNode into a Frame[] with path-based IDs.
 *
 * Each object node becomes a Frame. The frame ID is the full path
 * from root using "/" as separator. Leaf slot values go into
 * frame.slots; child object nodes become separate frames.
 */
export function flattenTree(tree: TreeNode): Frame[] {
  const frames: Frame[] = [];
  flattenNode(tree, '', frames);
  return frames;
}

function flattenNode(node: TreeNode, parentPath: string, frames: Frame[]): void {
  const path = parentPath ? `${parentPath}/${node.key}` : node.key;

  const frame: Frame = {
    id: path,
    type: node.key,
    slots: { ...node.slots },
  };
  if (node.source) frame.source = node.source;
  if (node.confidence !== undefined) frame.confidence = node.confidence;

  frames.push(frame);

  for (const child of node.children) {
    flattenNode(child, path, frames);
  }
}

/**
 * Reconstruct a TreeNode from a flat Frame[] with path-based IDs.
 *
 * Frames must be from the same tree (share a common root path segment).
 * The root frame has no "/" in its ID.
 */
export function unflattenToTree(frames: Frame[]): TreeNode {
  // Sort by path depth (root first)
  const sorted = [...frames].sort((a, b) => {
    const depthA = a.id.split('/').length;
    const depthB = b.id.split('/').length;
    return depthA - depthB;
  });

  if (sorted.length === 0) {
    throw new Error('Cannot unflatten empty frame list');
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
    const frame = sorted[i];
    const segments = frame.id.split('/');
    const parentPath = segments.slice(0, -1).join('/');

    const node: TreeNode = {
      key: frame.type,
      slots: { ...frame.slots },
      children: [],
      ...(frame.source ? { source: frame.source } : {}),
      ...(frame.confidence !== undefined ? { confidence: frame.confidence } : {}),
    };

    const parent = nodeMap.get(parentPath);
    if (parent) {
      parent.children.push(node);
    }
    nodeMap.set(frame.id, node);
  }

  return rootNode;
}

/**
 * Build a slot_quotes dot-path from a frame ID (tree path) and slot key.
 *
 * Frame ID: "hangzhou_trip/activity_plan" + slot key "activities"
 * → Quote path: "activity_plan.activities"
 *
 * The root node name is stripped — paths are relative to the tree root.
 */
export function buildSlotQuotesPath(frameId: string, slotKey: string): string {
  const segments = frameId.split('/');
  if (segments.length === 1) {
    // Root node slot
    return slotKey;
  }
  // Drop root, join remaining with ".", append slot key
  return [...segments.slice(1), slotKey].join('.');
}

/**
 * Resolve a slot_quotes dot-path back to frame ID + slot key.
 *
 * Quote path: "activity_plan.activities" + root: "hangzhou_trip"
 * → Frame ID: "hangzhou_trip/activity_plan", slot key: "activities"
 */
export function resolveSlotQuotesPath(
  quotePath: string,
  rootKey: string
): { frameId: string; slotKey: string } {
  const segments = quotePath.split('.');
  const slotKey = segments[segments.length - 1];
  if (segments.length === 1) {
    return { frameId: rootKey, slotKey };
  }
  const framePath = [rootKey, ...segments.slice(0, -1)].join('/');
  return { frameId: framePath, slotKey };
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
