import type { MergeSummaryData } from '@t3x-dev/core';
import type { Edge, Node } from '@xyflow/react';
import type { StateCreator } from 'zustand';
import { getTerminology } from '@/hooks/useTerminology';
import { executeMergeApi, prepareMergeApi } from '@/queries/mergeApi';
import { isDeveloperMode } from '@/store/shared';
import type { MergeResult } from '../types/merge';
import type { CanvasNodeData } from '../types/nodes';
import type { CanvasState, MergeSlice } from './canvasStoreTypes';
import { edgeStyle, edgeType, snapPosition } from './canvasStoreUtils';

export const createMergeSlice: StateCreator<CanvasState, [], [], MergeSlice> = (set, get) => ({
  // Initial state
  mergeState: null,
  mergeLoading: false,
  mergeError: null,

  /**
   * Start a merge between two commits
   * Calls API to prepare merge, stores result
   */
  startMerge: async (sourceHash: string, targetHash: string) => {
    const { notifyCallback } = get();

    // Clear previous errors and set loading
    set({ mergeLoading: true, mergeError: null });

    try {
      const data = await prepareMergeApi(sourceHash, targetHash);

      set({
        mergeState: {
          sourceHash,
          targetHash,
          prepared: data,
        },
        mergeLoading: false,
        mergeError: null,
      });

      notifyCallback?.('Merge prepared successfully', 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set({
        mergeLoading: false,
        mergeError: errorMessage,
      });

      notifyCallback?.(`Failed to prepare merge: ${errorMessage}`, 'error');
      throw error;
    }
  },

  /**
   * Execute the merge after all decisions are made
   * @param message - Commit message for merge
   * @returns The created merge commit
   */
  executeMerge: async (message: string) => {
    const { mergeState, notifyCallback } = get();

    if (!mergeState) {
      const errorMsg = 'No merge in progress';
      set({ mergeError: errorMsg });
      notifyCallback?.(errorMsg, 'error');
      throw new Error(errorMsg);
    }

    // Set loading state
    set({ mergeLoading: true, mergeError: null });

    try {
      // Determine target branch for the merge commit (default to 'main')
      const targetBranch = mergeState.targetBranch || 'main';

      const mergeCommit = (await executeMergeApi({
        source_hash: mergeState.sourceHash,
        target_hash: mergeState.targetHash,
        prepared: mergeState.prepared,
        message,
        branch: targetBranch,
      })) as {
        hash: string;
        parents: string[];
        author: { type?: 'human' | 'agent'; name?: string };
        committed_at: string;
        content: {
          trees: Array<{ key: string; slots: Record<string, unknown>; children: unknown[] }>;
          relations: Array<{ from: string; to: string; type: string }>;
        };
        message: string | null | undefined;
        branch: string | null | undefined;
        merge_summary?: MergeSummaryData;
      };

      // Get current nodes to calculate merge node position
      const { nodes } = get();

      // Find source and target nodes to calculate merge node position
      const sourceNode = nodes.find((n) => n.id === mergeState.sourceHash);
      const targetNode = nodes.find((n) => n.id === mergeState.targetHash);

      // Calculate position for merge commit node (below and between source/target)
      let mergeNodePosition = { x: 400, y: 400 }; // Default position
      if (sourceNode && targetNode) {
        const midX = (sourceNode.position.x + targetNode.position.x) / 2;
        const maxY = Math.max(sourceNode.position.y, targetNode.position.y);
        mergeNodePosition = snapPosition({
          x: midX,
          y: maxY + 200, // 200px below the lower node
        });
      } else if (sourceNode) {
        mergeNodePosition = snapPosition({
          x: sourceNode.position.x,
          y: sourceNode.position.y + 200,
        });
      } else if (targetNode) {
        mergeNodePosition = snapPosition({
          x: targetNode.position.x,
          y: targetNode.position.y + 200,
        });
      }

      // Create the merge commit node
      const mergeNode: Node<CanvasNodeData> = {
        id: mergeCommit.hash,
        type: 'unit',
        position: mergeNodePosition,
        data: {
          entryId: mergeCommit.hash.slice(0, 12),
          title:
            mergeCommit.message ||
            `${getTerminology('merge', isDeveloperMode())} ${getTerminology('commit', isDeveloperMode()).toLowerCase()}`,
          summary: `${mergeCommit.content.trees?.length ?? 0} trees`,
          status: 'committed',
          timestamp: mergeCommit.committed_at,
          tags: ['merge'],
          kind: 'unit',
          // Commit data
          commitStatus: 'committed',
          commitHash: mergeCommit.hash,
          isMergeCommit: true,
          // Use targetBranch as fallback if mergeCommit.branch is not set
          branchType: (mergeCommit.branch || targetBranch) === 'main' ? 'main' : 'branch',
          branchName:
            (mergeCommit.branch || targetBranch) !== 'main'
              ? mergeCommit.branch || targetBranch
              : undefined,
          // Content
          sourceExcerpt:
            mergeCommit.content.trees?.map(
              (f: any) =>
                `[${f.type}] ${Object.entries(f.slots || {})
                  .map(([k, v]: [string, any]) => `${k}: ${typeof v === 'string' ? v : String(v)}`)
                  .join('; ')}`
            ) ?? [],
          mustHave: undefined,
          mustntHave: undefined,
          // V4 commit data including merge summary
          commit: {
            hash: mergeCommit.hash,
            schema: 't3x/commit/5' as const,
            author: { type: 'human' as const, ...mergeCommit.author },
            committed_at: mergeCommit.committed_at,
            content: { trees: [], relations: [] },
            message: mergeCommit.message ?? null,
            branch: mergeCommit.branch ?? 'main',
            sources: null,
            merge_summary: mergeCommit.merge_summary,
          },
        },
      };

      // Create edges from parent commits to merge commit
      const newEdges: Edge[] = mergeCommit.parents.map((parentHash, idx) => ({
        id: `merge-edge-${parentHash}-${mergeCommit.hash}-${idx}`,
        source: parentHash,
        target: mergeCommit.hash,
        type: edgeType,
        animated: false,
        style: edgeStyle,
      }));

      // Update state with new node and edges (use callback to avoid stale state after await)
      set((state) => ({
        nodes: [...state.nodes, mergeNode],
        edges: [...state.edges, ...newEdges],
        mergeState: null,
        mergeLoading: false,
        mergeError: null,
      }));

      notifyCallback?.('Merge executed successfully', 'success');

      return mergeCommit;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set({
        mergeLoading: false,
        mergeError: errorMessage,
      });

      notifyCallback?.(`Failed to execute merge: ${errorMessage}`, 'error');
      throw error;
    }
  },

  /**
   * Cancel the current merge operation
   */
  cancelMerge: () => {
    set({
      mergeState: null,
      mergeLoading: false,
      mergeError: null,
    });
  },

  /**
   * Clear merge error message
   */
  clearMergeError: () => {
    set({ mergeError: null });
  },
});

// ============================================================================
// Merge Selectors
// ============================================================================

/**
 * Is a merge currently in progress?
 */
export const selectIsMerging = (state: CanvasState) => state.mergeState !== null;

/**
 * Can the merge be executed? (all conflicts resolved)
 */
export const selectCanExecuteMerge = (state: CanvasState) => {
  if (!state.mergeState) return false;
  // In tree-primary, conflicts are resolved via mergeWorkspaceStore
  return state.mergeState.prepared.conflicts.length === 0;
};

/**
 * How many conflicts are unresolved?
 */
export const selectUnresolvedCount = (state: CanvasState) => {
  if (!state.mergeState) return 0;
  return state.mergeState.prepared.conflicts.length;
};

/**
 * Get counts for merge summary
 */
export const selectMergeCounts = (state: CanvasState) => {
  if (!state.mergeState) {
    return null;
  }

  const { prepared } = state.mergeState;
  return {
    identical: prepared.autoKept.length,
    similar: prepared.conflicts.length,
    onlyInSource: prepared.onlyInSource.length,
    onlyInTarget: prepared.onlyInTarget.length,
    resolved: 0, // Resolution tracking is in mergeWorkspaceStore
  };
};
