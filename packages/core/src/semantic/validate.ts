import type {
  FlatNode,
  SemanticContent,
  TreeNode,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from './types';
import { flattenTrees } from './tree';

export function validateIntegrity(content: SemanticContent): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Flatten trees to nodes for relation endpoint checks
  const nodes = flattenTrees(content.trees);
  const nodeIds = new Set(nodes.map((f) => f.id));

  // 1. Duplicate keys within same tree level
  for (const tree of content.trees) {
    collectDuplicateKeys(tree, '', errors);
  }
  // Also check root-level tree key duplicates
  const rootKeyCounts = new Map<string, number>();
  for (const tree of content.trees) {
    rootKeyCounts.set(tree.key, (rootKeyCounts.get(tree.key) ?? 0) + 1);
  }
  for (const [key, count] of rootKeyCounts) {
    if (count > 1) {
      errors.push({
        type: 'duplicate_key',
        message: `Root tree key "${key}" appears ${count} times`,
        location: key,
      });
    }
  }

  // 2. Relation endpoint checks (relation from/to use path IDs)
  for (const rel of content.relations) {
    if (!nodeIds.has(rel.from)) {
      errors.push({
        type: 'broken_relation',
        message: `Relation from "${rel.from}" — no such node path`,
        location: `${rel.from}->${rel.to}`,
      });
    }
    if (!nodeIds.has(rel.to)) {
      errors.push({
        type: 'broken_relation',
        message: `Relation to "${rel.to}" — no such node path`,
        location: `${rel.from}->${rel.to}`,
      });
    }
    // 3. No self-relations
    if (rel.from === rel.to) {
      errors.push({
        type: 'self_relation',
        message: `Self-referencing relation on "${rel.from}"`,
        location: `${rel.from}->${rel.to}`,
      });
    }
  }

  // 4. Cycle detection (causes + follows)
  const causalEdges = content.relations.filter((r) => r.type === 'causes' || r.type === 'follows');
  const graph = new Map<string, string[]>();
  for (const edge of causalEdges) {
    if (!graph.has(edge.from)) graph.set(edge.from, []);
    graph.get(edge.from)!.push(edge.to);
  }
  const visited = new Set<string>();
  const inStack = new Set<string>();
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      const path: string[] = [];
      if (hasCycle(node, graph, visited, inStack, path)) {
        const cycleStart = path[path.length - 1];
        const cycleIdx = path.indexOf(cycleStart);
        const cyclePath = path.slice(cycleIdx).join(' → ');
        errors.push({
          type: 'cycle',
          message: `Causal/temporal cycle detected: ${cyclePath}`,
          location: node,
        });
      }
    }
  }

  // 5. Orphan trees — only warn when multiple trees exist
  if (content.trees.length > 1) {
    const connected = new Set<string>();
    for (const rel of content.relations) {
      connected.add(rel.from.split('/')[0]);
      connected.add(rel.to.split('/')[0]);
    }
    for (const tree of content.trees) {
      if (!connected.has(tree.key)) {
        warnings.push({
          type: 'orphan_tree',
          message: `Tree "${tree.key}" has no relations to other trees`,
          location: tree.key,
        });
      }
    }
  }

  // 6. Low confidence
  for (const node of nodes) {
    if (node.confidence !== undefined && node.confidence < 0.5) {
      warnings.push({
        type: 'low_confidence',
        message: `Node "${node.id}" confidence: ${node.confidence}`,
        location: node.id,
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Check for duplicate keys among siblings at each tree level */
function collectDuplicateKeys(
  node: TreeNode,
  parentPath: string,
  errors: ValidationError[]
): void {
  const childKeyCounts = new Map<string, number>();
  for (const child of node.children) {
    childKeyCounts.set(child.key, (childKeyCounts.get(child.key) ?? 0) + 1);
  }
  const nodePath = parentPath ? `${parentPath}/${node.key}` : node.key;
  for (const [key, count] of childKeyCounts) {
    if (count > 1) {
      errors.push({
        type: 'duplicate_key',
        message: `Key "${key}" appears ${count} times under "${nodePath}"`,
        location: `${nodePath}/${key}`,
      });
    }
  }
  for (const child of node.children) {
    collectDuplicateKeys(child, nodePath, errors);
  }
}

export function checkRelationSanity(content: SemanticContent): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const nodes = flattenTrees(content.trees);
  const nodeMap = new Map<string, FlatNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  for (const rel of content.relations) {
    // 1. Contrasts between nodes of the same type
    if (rel.type === 'contrasts') {
      const fromNode = nodeMap.get(rel.from);
      const toNode = nodeMap.get(rel.to);
      if (fromNode && toNode && fromNode.type === toNode.type) {
        warnings.push({
          type: 'same_type_contrast',
          message: `Contrasts between same type ${fromNode.type} — verify this is intentional`,
          location: `${rel.from}->${rel.to}`,
        });
      }
    }
  }

  // 2. Contrasts + causes between same pair (A→B)
  const contrastPairs = new Set<string>();
  const causesPairs = new Set<string>();
  for (const rel of content.relations) {
    const key = `${rel.from}->${rel.to}`;
    if (rel.type === 'contrasts') contrastPairs.add(key);
    if (rel.type === 'causes') causesPairs.add(key);
  }
  for (const pair of contrastPairs) {
    if (causesPairs.has(pair)) {
      warnings.push({
        type: 'same_type_contrast',
        message: `Both contrasts and causes between same nodes — possible logical contradiction`,
        location: pair,
      });
    }
  }

  return warnings;
}

function hasCycle(
  node: string,
  graph: Map<string, string[]>,
  visited: Set<string>,
  inStack: Set<string>,
  path: string[]
): boolean {
  visited.add(node);
  inStack.add(node);
  path.push(node);
  for (const neighbor of graph.get(node) ?? []) {
    if (inStack.has(neighbor)) {
      path.push(neighbor);
      return true;
    }
    if (!visited.has(neighbor) && hasCycle(neighbor, graph, visited, inStack, path)) return true;
  }
  inStack.delete(node);
  path.pop();
  return false;
}
