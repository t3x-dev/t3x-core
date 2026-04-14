/**
 * useCanvasNodeActions — view-facing API for loading canvas data and
 * creating canvas nodes.
 *
 * Owns the I/O previously in canvasNodeSlice async methods per v2 §2.5.
 * The slice retains state + state-only setters (setProjectData,
 * mergeProjectData, setLeavesByCommit, addToNodes) which this hook
 * calls after the I/O resolves.
 */

import type { Edge, Node } from '@xyflow/react';
import { useCallback } from 'react';
import { createConversation } from '@/commands/conversations';
import { createWorkbenchDraft } from '@/commands/drafts';
import { fetchCommits } from '@/queries/commits';
import { fetchConversations } from '@/queries/conversations';
import { fetchLeavesByProject } from '@/queries/leaves';
import { fetchTurn } from '@/queries/turns';
import { fetchWorkbenchDrafts } from '@/queries/workbenchDrafts';
import { useCanvasStore } from '@/store/canvasStore';
import { snapPosition } from '@/store/canvasStoreUtils';
import type { Conversation, Leaf } from '@/types/api';
import type { CanvasNodeData, EmbeddedLeaf, NodeKind } from '../types/nodes';
import { composeCanvasFromFetches } from './useCanvasNodeActions.compose';

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
        const [convResponse, apiCommits, projectLeaves] = await Promise.all([
          fetchConversations(projectId, 100, 0),
          fetchCommits(projectId, undefined, 100),
          fetchLeavesByProject(projectId).catch((err) => {
            console.warn('[useCanvasNodeActions] Failed to load leaves:', err);
            return [] as Leaf[];
          }),
        ]);

        if (useCanvasStore.getState().projectId !== projectId) return;

        const conversations = convResponse.conversations;

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

        // Drafts (non-critical)
        let editingDrafts: Awaited<ReturnType<typeof fetchWorkbenchDrafts>> = [];
        try {
          editingDrafts = await fetchWorkbenchDrafts(projectId, 'editing');
        } catch {
          // non-critical
        }

        if (useCanvasStore.getState().projectId !== projectId) return;

        const result = composeCanvasFromFetches(
          projectId,
          conversations,
          apiCommits,
          projectLeaves,
          editingDrafts,
          turnToConvMap,
          existingNodePositions
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
        const embedded: EmbeddedLeaf = {
          id: leaf.id,
          type: leaf.type,
          title: leaf.title || leaf.type,
          createdAt: leaf.created_at,
        };
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
    async (kind: NodeKind, position?: { x: number; y: number }): Promise<void> => {
      const store = useCanvasStore.getState();
      const total = store.nodes.length;
      const basePosition = position ?? {
        x: 140 + (total % 3) * 220,
        y: 100 + Math.floor(total / 3) * 180,
      };
      const snappedPosition = snapPosition(basePosition);

      if (kind === 'unit') {
        if (!store.projectId) {
          throw new Error('Cannot create unit: no project selected');
        }
        const conversation = await createConversation(store.projectId, 'Untitled Unit', undefined, {
          x: snappedPosition.x,
          y: snappedPosition.y,
        });
        const newNode: Node<CanvasNodeData> = {
          id: conversation.conversation_id,
          type: 'unit',
          position: snappedPosition,
          data: {
            entryId: conversation.conversation_id.replace(/^conv_/, '').slice(0, 8),
            title: conversation.title || 'Untitled Unit',
            summary: '0 turns',
            status: 'staging',
            timestamp: conversation.created_at,
            tags: ['unit'],
            kind: 'unit',
            conversationId: conversation.conversation_id,
            commitStatus: 'staging',
            sourceConversationId: conversation.conversation_id,
          },
        };
        useCanvasStore.getState().addToNodes(newNode);
        return;
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

  const addDraft = useCallback(async (position?: { x: number; y: number }): Promise<void> => {
    const store = useCanvasStore.getState();
    if (!store.projectId) {
      throw new Error('Cannot create draft: no project selected');
    }
    const total = store.nodes.length;
    const basePosition = position ?? {
      x: 140 + (total % 3) * 220,
      y: 100 + Math.floor(total / 3) * 180,
    };
    const snappedPosition = snapPosition(basePosition);

    const draft = await createWorkbenchDraft({
      project_id: store.projectId,
      title: 'Untitled Draft',
    });

    const newNode: Node<CanvasNodeData> = {
      id: draft.id,
      type: 'unit',
      position: snappedPosition,
      data: {
        entryId: draft.id.replace(/^draft_/, '').slice(0, 8),
        title: draft.title,
        summary: 'Draft',
        status: 'draft',
        timestamp: draft.created_at,
        tags: ['draft'],
        kind: 'unit',
        commitStatus: 'draft',
        draftId: draft.id,
      },
    };
    useCanvasStore.getState().addToNodes(newNode);
  }, []);

  return { load, refresh, add, addDraft };
}
