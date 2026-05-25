import type { TreeNode } from '@t3x-dev/core';

export interface ParentCommit {
  hash: string;
  trees: TreeNode[];
  message: string | null;
}
