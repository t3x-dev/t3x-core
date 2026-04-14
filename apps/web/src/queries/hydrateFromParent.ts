/**
 * L3 — hydrate workspace + commit stores from a parent commit hash.
 *
 * Bridge query used on the "Create Unit" inheritance flow: a new
 * conversation is mounted with `inheritFromCommitHash`, and this query
 * fetches that commit, pins it as the workspace's logical parent, and
 * expands the YOps panel.
 *
 * React state (the parent-conversation banner + the inheritedRef + the
 * onInheritComplete callback) stays in the component; this function
 * returns the data the component needs and performs only store-side
 * mutations.
 */

import type { TreeNode } from '@t3x-dev/core';
import { treesToNodes } from '@/domain/tree/treeCompat';
import { useCommitStore } from '@/store/commitStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { fetchCommitForInheritance } from './chatInitFetch';

export interface ParentHydrationResult {
  /** Commit's parent conversation (if any) — for the "View parent" banner. */
  parentConversationId: string | null;
  /** True if the parent commit was fetched successfully. */
  inherited: boolean;
}

export async function hydrateFromParent(hash: string): Promise<ParentHydrationResult> {
  try {
    const parentCommit = await fetchCommitForInheritance(hash);

    const sources = (parentCommit as { sources?: Array<{ type?: string; id?: string }> }).sources;
    const parentConvSource = sources?.find((s) => s.type === 'conversation');
    const parentConversationId = parentConvSource?.id ?? null;

    const trees = (parentCommit.content?.trees as TreeNode[]) ?? [];
    if (trees.length > 0) {
      // Pin the parent commit so:
      //  - commit B gets the correct parent_hashes at commit time
      //  - BeforePanel's useParentCommit query fetches the frozen tree
      useCommitStore.setState({ lastCommitHash: hash });

      const confirmed: Record<string, boolean> = {};
      for (const f of treesToNodes(trees)) {
        confirmed[f.id] = true;
      }
      useCommitStore.setState({ confirmedNodeIds: confirmed });

      if (!useWorkspaceStore.getState().panelExpanded) {
        useWorkspaceStore.getState().setPanelExpanded(true);
      }
    }

    return { parentConversationId, inherited: true };
  } catch {
    return { parentConversationId: null, inherited: false };
  }
}
