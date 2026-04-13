/**
 * useCommitOperations — view-facing API for commit writes + bootstrap.
 *
 * Owns the I/O that previously lived inside commitStore.commitNodes and
 * commitStore.initCommitState. Store is now passive (v2 §2.5); this hook
 * composes the commands/commits entry with domain enrichment and store
 * setters. Return shape preserves the old getState().action() call sites
 * so consumers only change the import line.
 */

import type { TreeNode } from '@t3x-dev/core';
import { flattenTrees } from '@t3x-dev/core';
import { useCallback } from 'react';
import { createCommit } from '@/commands/commits';
import { fetchCommits } from '@/queries/commits';
import { useCommitStore } from '@/store/commitStore';
import { usePinsStore } from '@/store/pinsStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function useCommitOperations() {
  const commitNodes = useCallback(async (message: string): Promise<{ hash: string }> => {
    const commit = useCommitStore.getState();
    const { tree, sourceIndex, conversationId } = useWorkspaceStore.getState();
    const draft = tree;
    const { projectId, lastCommitHash, commitBranch, conversationTitle } = commit;

    if (!projectId) throw new Error('No project ID');

    commit.setIsCommitting(true);
    commit.setCommitError(null);
    try {
      // Enrich trees with source_ref derived from sourceIndex (replayed ops).
      // No network call or slot_quotes walk needed — the extraction pipeline
      // already records turn_hash + char offsets on every LLMSource.
      let enrichedTrees = draft.trees;
      if (conversationId && sourceIndex.size > 0) {
        try {
          const { enrichTreesWithSourceRefs } = await import('@/domain/enrichSourceRefs');
          enrichedTrees = enrichTreesWithSourceRefs(draft.trees, conversationId, sourceIndex);
        } catch {
          // Silent fallback — commit without source_ref enrichment
        }
      }

      // Sanitize slot values: API only accepts string | number | SlotRef | Array.
      // Nested objects from LLM extraction must be stringified.
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

      const sanitizedTrees = sanitizeTrees(enrichedTrees);

      // Build sources array: active conversation + selected pins
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

      // Add pinned sources that were actually selected during extraction
      const selectedPinIds = useWorkspaceStore.getState().lastExtractionPinIds;
      if (selectedPinIds.length > 0) {
        const allPins = usePinsStore.getState().pins;
        const selectedPins = allPins.filter((p) => selectedPinIds.includes(p.id));
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

      commit.setLastCommitHash(result.commit.hash);
      commit.setCommittedState(newCommittedIds, newSnapshot);
      commit.setIsCommitting(false);
      commit.resetManualEditedNodeIds();

      return { hash: result.commit.hash };
    } catch (err) {
      commit.setIsCommitting(false);
      commit.setCommitError(err instanceof Error ? err.message : 'Commit failed');
      throw err;
    }
  }, []);

  const initCommitState = useCallback(async (projectId: string): Promise<void> => {
    const commit = useCommitStore.getState();
    try {
      const recentCommits = await fetchCommits(projectId, 'main', 1).catch(() => []);
      if (recentCommits.length > 0) {
        const head = recentCommits[0];
        commit.setLastCommitHash(head.hash);
        const trees = (head.content?.trees ?? []) as TreeNode[];
        if (trees.length > 0) {
          const flat = flattenTrees(trees);
          const ids: Record<string, boolean> = {};
          const snapshot: Record<string, TreeNode> = {};
          for (const f of flat) {
            ids[f.id] = true;
          }
          for (const t of trees) {
            snapshot[t.key] = t;
          }
          commit.setCommittedState(ids, snapshot);
        }
      }
    } catch {
      // Silent fallback — treat as no prior commits
    }
  }, []);

  return { commitNodes, initCommitState };
}
