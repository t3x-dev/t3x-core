/**
 * useCommitActions — view-facing API for the chat-panel commit flow.
 *
 * Per docs/frontend-architecture-v2-zh.md §2.5, async actions live in
 * hooks. This hook owns the two async flows previously on
 * `commitStore`:
 *   - commit(message)  → @/commands/commits.createCommit, enrich trees with source_ref,
 *                        sanitize slot values, write result via setters
 *   - init(projectId, branch) → fetchCommits (HEAD), seed lastCommitHash +
 *                        committedNodeIds/Snapshot for the chat-panel UI
 *
 * The store retains state + passive setters. Both methods call the
 * store's setters after the API resolves — the store never touches
 * @/queries directly.
 */

import type { TreeNode } from '@t3x-dev/core';
import { flattenTrees } from '@t3x-dev/core';
import { useCallback } from 'react';
import { createCommit } from '@/commands/commits';
import { enrichTreesWithSourceRefs } from '@/domain/enrichSourceRefs';
import { fetchCommits } from '@/queries/commits';
import { useCommitStore } from '@/store/commitStore';
import { usePinsStore } from '@/store/pinsStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

function sanitizeSlots(slots: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(slots)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && !('ref' in v)) {
      out[k] = JSON.stringify(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeTrees(trees: TreeNode[]): TreeNode[] {
  return trees.map(
    (t) =>
      Object.assign({}, t, {
        slots: sanitizeSlots(t.slots),
        children: sanitizeTrees(t.children),
      }) as TreeNode
  );
}

interface CommitResult {
  hash: string;
  projectId: string;
  conversationId: string | null;
  branch: string;
  sourceConversationIds: string[];
}

export function useCommitActions() {
  const commit = useCallback(async (message: string): Promise<CommitResult> => {
    const { tree, sourceIndex, conversationId, lastExtractionPinIds } =
      useWorkspaceStore.getState();
    const draft = tree;
    const { projectId, lastCommitHash, commitBranch, conversationTitle } =
      useCommitStore.getState();

    if (!projectId) throw new Error('No project ID');

    useCommitStore.getState().setIsCommitting(true);
    useCommitStore.getState().setCommitError(null);

    try {
      let enrichedTrees = draft.trees;
      if (conversationId && sourceIndex.size > 0) {
        try {
          enrichedTrees = enrichTreesWithSourceRefs(draft.trees, conversationId, sourceIndex);
        } catch {
          // Silent fallback — commit without source_ref enrichment
        }
      }

      const sanitizedTrees = sanitizeTrees(enrichedTrees);

      const sources: Array<{
        type: string;
        id: string;
        title?: string;
        assertion_lessons?: string[];
      }> = [];

      if (conversationId) {
        sources.push({
          type: 'conversation',
          id: conversationId,
          title: conversationTitle ?? undefined,
        });
      }

      if (lastExtractionPinIds.length > 0) {
        const allPins = usePinsStore.getState().pins;
        const selectedPins = allPins.filter((p) => lastExtractionPinIds.includes(p.id));
        for (const pin of selectedPins) {
          if (pin.type === 'conversation' && pin.ref_id !== conversationId) {
            sources.push({ type: 'conversation', id: pin.ref_id });
          } else if (pin.type === 'leaf') {
            sources.push({ type: 'leaf', id: pin.ref_id });
          }
        }
      }

      const result = await createCommit(
        projectId,
        {
          trees: sanitizedTrees,
          relations: draft.relations,
        },
        {
          parents: lastCommitHash ? [lastCommitHash] : [],
          branch: commitBranch,
          message: message || undefined,
          sources: sources.length > 0 ? sources : undefined,
          source_conversation_id: conversationId ?? undefined,
          provenance: { method: 'llm_extraction' },
        }
      );

      const newCommittedIds: Record<string, boolean> = {};
      const newSnapshot: Record<string, TreeNode> = {};
      const flat = flattenTrees(draft.trees);
      for (const f of flat) {
        newCommittedIds[f.id] = true;
      }
      for (const t of draft.trees) {
        newSnapshot[t.key] = { ...t, slots: { ...t.slots } };
      }

      useCommitStore.getState().setCommitSuccess({
        lastCommitHash: result.commit.hash,
        committedNodeIds: newCommittedIds,
        committedNodeSnapshot: newSnapshot,
      });

      return {
        hash: result.commit.hash,
        projectId,
        conversationId,
        branch: commitBranch,
        sourceConversationIds: sources
          .filter((source) => source.type === 'conversation')
          .map((source) => source.id),
      };
    } catch (err) {
      useCommitStore.getState().setIsCommitting(false);
      useCommitStore
        .getState()
        .setCommitError(err instanceof Error ? err.message : 'Commit failed');
      throw err;
    }
  }, []);

  const init = useCallback(async (projectId: string, branch = 'main'): Promise<string | null> => {
    try {
      const recentCommits = await fetchCommits(projectId, branch, 1).catch(() => []);
      if (useCommitStore.getState().projectId !== projectId) return null;
      useCommitStore.getState().setCommitBranch(branch);
      if (recentCommits.length === 0) {
        useCommitStore.setState({
          lastCommitHash: null,
          beforeCommitHash: null,
          committedNodeIds: {},
          committedNodeSnapshot: {},
        });
        return null;
      }

      const head = recentCommits[0];
      const trees = (head.content?.trees ?? []) as TreeNode[];
      if (trees.length === 0) {
        useCommitStore.getState().setInitialCommit(head.hash, {}, {});
        useCommitStore.getState().setBeforeCommitHash(head.hash);
        return head.hash;
      }

      const flat = flattenTrees(trees);
      const ids: Record<string, boolean> = {};
      const snapshot: Record<string, TreeNode> = {};
      for (const f of flat) {
        ids[f.id] = true;
      }
      for (const t of trees) {
        snapshot[t.key] = t;
      }
      useCommitStore.getState().setInitialCommit(head.hash, ids, snapshot);
      useCommitStore.getState().setBeforeCommitHash(head.hash);
      return head.hash;
    } catch {
      // Silent fallback — treat as no prior commits
      return null;
    }
  }, []);

  return { commit, init };
}
