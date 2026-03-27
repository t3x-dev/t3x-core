import type { SemanticContent, TreeNode } from '@t3x-dev/core';

/**
 * Get nested tree nodes from SemanticContent.
 *
 * In tree-primary architecture, trees are already native — no nesting
 * reconstruction needed. This function exists for backward compatibility
 * with code that called nestFrames().
 */
export function nestFrames(content: SemanticContent): TreeNode[] {
  return content.trees;
}
