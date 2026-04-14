import type { SemanticContent, TreeNode } from '@t3x-dev/core';

/**
 * Get nested tree nodes from SemanticContent.
 *
 * In tree-primary architecture, trees are already native — no nesting
 * reconstruction needed. This function exists for backward compatibility
 * with code that called nestNodes().
 */
export function nestNodes(content: SemanticContent): TreeNode[] {
  return content.trees;
}
