/**
 * Hash computation for tree-primary commits.
 *
 * First-class fields (in hash):
 *   schema, parents, author, committed_at,
 *   content.trees (key, slots, children — recursive),
 *   content.relations (from, to, type)
 *
 * Second-class fields (NOT in hash):
 *   tree node source, slot_quotes, confidence,
 *   project_id, message, branch, provenance, position
 */

import { sha256 } from '../common/hash';
import type { CommitFirstClass } from './types';
import type { TreeNode } from '../semantic/types';

function stripTree(node: TreeNode): { key: string; slots: Record<string, unknown>; children: ReturnType<typeof stripTree>[] } {
  return {
    key: node.key,
    slots: node.slots,
    children: node.children.map(stripTree),
  };
}

export function computeCommitHash(commit: CommitFirstClass): string {
  const hashable = {
    schema: commit.schema,
    parents: commit.parents,
    author: commit.author,
    committed_at: commit.committed_at,
    content: {
      trees: commit.content.trees.map(stripTree),
      relations: commit.content.relations.map((r) => ({
        from: r.from,
        to: r.to,
        type: r.type,
      })),
    },
  };

  return `sha256:${sha256(hashable)}`;
}
