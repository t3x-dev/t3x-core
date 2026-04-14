/**
 * L3 read — fetch a parent commit and derive the data a chat
 * inheritance flow needs to seed commit + workspace stores.
 *
 * Per v2 §2.3, this query returns data only; the caller
 * (useChatInit) owns the store writes.
 */

import type { TreeNode } from '@t3x-dev/core';
import { treesToNodes } from '@/domain/tree/treeCompat';
import { fetchCommitForInheritance } from './chatInitFetch';

export interface ParentCommitData {
  /** Commit's parent conversation (if any) — for the "View parent" banner. */
  parentConversationId: string | null;
  /**
   * The fetched commit's own hash, surfaced so the caller can pin it
   * as the workspace's logical parent (commitStore.lastCommitHash).
   * `null` when the fetch succeeded but the commit had no trees, or
   * when the fetch failed.
   */
  lastCommitHash: string | null;
  /** Map of node-id -> true for every tree node on the parent commit. */
  confirmedNodeIds: Record<string, boolean>;
  /** True iff the parent commit had non-empty trees. */
  hasTrees: boolean;
  /** True iff the fetch succeeded. */
  fetched: boolean;
}

export async function fetchParentCommitData(hash: string): Promise<ParentCommitData> {
  try {
    const parentCommit = await fetchCommitForInheritance(hash);

    const sources = (parentCommit as { sources?: Array<{ type?: string; id?: string }> }).sources;
    const parentConvSource = sources?.find((s) => s.type === 'conversation');
    const parentConversationId = parentConvSource?.id ?? null;

    const trees = (parentCommit.content?.trees as TreeNode[]) ?? [];
    if (trees.length === 0) {
      return {
        parentConversationId,
        lastCommitHash: null,
        confirmedNodeIds: {},
        hasTrees: false,
        fetched: true,
      };
    }

    const confirmed: Record<string, boolean> = {};
    for (const f of treesToNodes(trees)) {
      confirmed[f.id] = true;
    }

    return {
      parentConversationId,
      lastCommitHash: hash,
      confirmedNodeIds: confirmed,
      hasTrees: true,
      fetched: true,
    };
  } catch {
    return {
      parentConversationId: null,
      lastCommitHash: null,
      confirmedNodeIds: {},
      hasTrees: false,
      fetched: false,
    };
  }
}
