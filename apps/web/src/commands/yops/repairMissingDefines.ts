import type { SemanticContent, SourcedYOp } from '@t3x-dev/core';
import { findNode, getParentPath } from '@t3x-dev/core';

function getDefinedPaths(baseTree: SemanticContent): Set<string> {
  const paths = new Set<string>();
  const walk = (path: string, node: { children?: Array<{ key: string; children?: any[] }> }) => {
    paths.add(path);
    for (const child of node.children ?? []) {
      walk(`${path}/${child.key}`, child);
    }
  };
  for (const tree of baseTree.trees) {
    walk(tree.key, tree);
  }
  return paths;
}

export function repairMissingDefinesForPopulate(
  baseTree: SemanticContent,
  ops: readonly SourcedYOp[]
): SourcedYOp[] {
  const knownPaths = getDefinedPaths(baseTree);
  const repaired: SourcedYOp[] = [];

  for (const op of ops) {
    if ('define' in op && op.define?.path) {
      knownPaths.add(op.define.path);
      repaired.push(op);
      continue;
    }

    if ('populate' in op && op.populate?.path) {
      const targetPath = op.populate.path;
      if (!knownPaths.has(targetPath)) {
        const parentPath = getParentPath(targetPath);
        const parentExists =
          parentPath === '' ||
          knownPaths.has(parentPath) ||
          !!findNode(baseTree.trees, parentPath);

        if (parentExists) {
          repaired.push({
            define: { path: targetPath },
            source: op.source,
          });
          knownPaths.add(targetPath);
        }
      }
    }

    if ('set' in op && op.set?.path) {
      const parentPath = getParentPath(op.set.path);
      if (parentPath) {
        knownPaths.add(parentPath);
      }
    }

    repaired.push(op);

    if ('define' in op && op.define?.path) {
      knownPaths.add(op.define.path);
    }
  }

  return repaired;
}
