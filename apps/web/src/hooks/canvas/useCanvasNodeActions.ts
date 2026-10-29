/**
 * useCanvasNodeActions — view-facing API for loading canvas data and
 * creating canvas nodes.
 *
 * Owns the I/O previously in canvasNodeSlice async methods per v2 §2.5.
 * The slice retains state + state-only setters (setProjectData,
 * mergeProjectData, setLeavesByCommit, addToNodes) which this hook
 * calls after the I/O resolves.
 */

import { useCallback } from 'react';
import { createConversation } from '@/commands/conversations';
import { toEmbeddedLeaf } from '@/hooks/canvas/leafEmbedding';
import { composeCanvasFromFetches } from '@/hooks/canvas/useCanvasNodeActions.compose';
import { fetchCommits } from '@/infrastructure/commits';
import { listProjectWorkspaces } from '@/infrastructure/workspaces';
import { fetchAllConversations } from '@/queries/conversations';
import { fetchLeavesByProject } from '@/queries/leaves';
import { fetchTurn } from '@/queries/turns';
import { useCanvasStore } from '@/store/canvasStore';
import type { Conversation, Leaf } from '@/types/api';
import type { EmbeddedLeaf, NodeKind } from '@/types/nodes';

export function useCanvasNodeActions() {
  const load = useCallback(
    async (projectId: string, options?: { merge?: boolean }): Promise<void> => {
      const store = useCanvasStore.getState();

      // Skip if already loading the same project
      if (store.projectId === projectId && store.loading) return;

      if (!options?.merge) {
        store.setLoading(true);
        store.setLoadError(null);
      }
      // Mark projectId early so in-flight guards can detect project swaps
      useCanvasStore.setState({ projectId });

      try {
        const [conversations, apiCommits, projectLeaves, workspaces] = await Promise.all([
          fetchAllConversations(projectId),
          fetchCommits(projectId, undefined, 100),
          fetchLeavesByProject(projectId).catch((err) => {
            console.warn('[useCanvasNodeActions] Failed to load leaves:', err);
            return [] as Leaf[];
          }),
          listProjectWorkspaces(projectId).catch((err) => {
            console.warn('[useCanvasNodeActions] Failed to load workspaces:', err);
            return [];
          }),
        ]);

        if (useCanvasStore.getState().projectId !== projectId) return;

        // Resolve turn → conversation for commits that have turn_window
        const turnHashesToLookup = new Set<string>();
        apiCommits.forEach((v5) => {
          // v5 commits don't carry turn_window; legacy lookup kept for safety if ever populated
          const asLegacy = v5 as unknown as {
            turn_window?: { start_turn_hash?: string; end_turn_hash?: string };
          };
          const startHash = asLegacy.turn_window?.start_turn_hash;
          const endHash = asLegacy.turn_window?.end_turn_hash;
          if (startHash && typeof startHash === 'string' && startHash !== 'undefined') {
            turnHashesToLookup.add(startHash);
          }
          if (endHash && typeof endHash === 'string' && endHash !== 'undefined') {
            turnHashesToLookup.add(endHash);
          }
        });

        const turnToConvMap = new Map<string, string>();
        if (turnHashesToLookup.size > 0) {
          await Promise.all(
            Array.from(turnHashesToLookup).map(async (turnHash) => {
              try {
                const turn = await fetchTurn(turnHash);
                turnToConvMap.set(turn.turn_hash, turn.conversation_id);
              } catch {
                // skip
              }
            })
          );
        }

        // Preserve existing positions
        const existingNodePositions = new Map<string, { x: number; y: number }>();
        useCanvasStore.getState().nodes.forEach((node) => {
          existingNodePositions.set(node.id, node.position);
        });

        const result = composeCanvasFromFetches(
          projectId,
          conversations,
          apiCommits,
          projectLeaves,
          turnToConvMap,
          existingNodePositions,
          workspaces
        );

        if (options?.merge) {
          useCanvasStore.getState().mergeProjectData(result);
        } else {
          useCanvasStore.getState().setProjectData(result);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const s = useCanvasStore.getState();
        s.setLoading(false);
        s.setLoadError(error);
      }
    },
    []
  );

  const refresh = useCallback(async (projectId: string): Promise<void> => {
    try {
      const projectLeaves = await fetchLeavesByProject(projectId).catch(() => [] as Leaf[]);
      const leavesByCommit = new Map<string, EmbeddedLeaf[]>();
      for (const leaf of projectLeaves) {
        const embedded = toEmbeddedLeaf(leaf);
        const existing = leavesByCommit.get(leaf.commit_hash) || [];
        existing.push(embedded);
        leavesByCommit.set(leaf.commit_hash, existing);
      }
      useCanvasStore.getState().setLeavesByCommit(leavesByCommit);
    } catch {
      // silent
    }
  }, []);

  const add = useCallback(
    async (
      kind: NodeKind,
      position?: { x: number; y: number }
    ): Promise<Conversation | undefined> => {
      const store = useCanvasStore.getState();

      if (kind === 'unit') {
        if (!store.projectId) {
          throw new Error('Cannot create unit: no project selected');
        }
        return createConversation(store.projectId, 'Untitled Unit', undefined, position);
      }

      if (kind === 'leaf') {
        store.notifyCallback?.(
          'To create a Leaf, click "Add output" on a committed Unit node.',
          'warning'
        );
        return;
      }

      throw new Error(`Cannot create node of kind "${kind}" directly.`);
    },
    []
  );

  return { load, refresh, add };
}
