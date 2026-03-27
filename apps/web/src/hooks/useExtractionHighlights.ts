import type { SemanticContent, TreeNode } from '@t3x-dev/core';
import { useMemo } from 'react';

export interface HighlightSpan {
  frameId: string;
  frameType: string;
}

/**
 * Map tree nodes to turn hashes for highlight overlay.
 * Returns a map: turnHash → list of highlight spans from that turn's nodes.
 */
export function useExtractionHighlights(content: SemanticContent) {
  return useMemo(() => {
    const map = new Map<string, HighlightSpan[]>();
    function walk(nodes: TreeNode[], prefix = '') {
      for (const node of nodes) {
        const path = prefix ? `${prefix}.${node.key}` : node.key;
        if (node.source) {
          const existing = map.get(node.source) ?? [];
          existing.push({ frameId: path, frameType: node.key });
          map.set(node.source, existing);
        }
        if (node.children.length > 0) {
          walk(node.children, path);
        }
      }
    }
    walk(content.trees);
    return map;
  }, [content.trees]);
}
