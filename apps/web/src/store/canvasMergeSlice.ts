import type { MergeSummaryData } from '@t3x/core';
import type { Edge, Node } from '@xyflow/react';
import type { StateCreator } from 'zustand';
import type { CommitV3 } from '../types/merge';
import type { CanvasNodeData } from '../types/nodes';
import type { CanvasState, MergeSlice } from './canvasStoreTypes';
import { API_V1, edgeStyle, edgeType, snapPosition } from './canvasStoreUtils';

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
      const response = await fetch(`${API_V1}/merge/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_hash: sourceHash, target_hash: targetHash }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || 'Failed to prepare merge');
      }

      set({
        mergeState: {
          sourceHash,
          targetHash,
          prepared: json.data,
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
   * Resolve a similar pair conflict
   * @param index - Index in similarPairs array
   * @param pick - 'source' or 'target'
   */
  resolveSimilarPair: (index: number, pick: 'source' | 'target') => {
    set((state) => {
      if (!state.mergeState) return state;

      const newPairs = [...state.mergeState.prepared.similarPairs];
      newPairs[index] = { ...newPairs[index], resolution: pick };

      return {
        mergeState: {
          ...state.mergeState,
          prepared: {
            ...state.mergeState.prepared,
            similarPairs: newPairs,
          },
        },
      };
    });
  },

  /**
   * Toggle keep/discard for a unique sentence
   * @param side - 'source' or 'target'
   * @param index - Index in onlyInSource or onlyInTarget array
   */
  toggleKeep: (side: 'source' | 'target', index: number) => {
    set((state) => {
      if (!state.mergeState) return state;

      const key = side === 'source' ? 'onlyInSource' : 'onlyInTarget';
      const newCandidates = [...state.mergeState.prepared[key]];
      newCandidates[index] = {
        ...newCandidates[index],
        keep: !newCandidates[index].keep,
      };

      return {
        mergeState: {
          ...state.mergeState,
          prepared: {
            ...state.mergeState.prepared,
            [key]: newCandidates,
          },
        },
      };
    });
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

      const response = await fetch(`${API_V1}/merge/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_hash: mergeState.sourceHash,
          target_hash: mergeState.targetHash,
          prepared: mergeState.prepared,
          message,
          branch: targetBranch, // Merge commit goes to target branch
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || 'Failed to execute merge');
      }

      const mergeCommit = json.data as CommitV3 & { merge_summary?: MergeSummaryData };

      // Get current nodes and edges to add the merge commit node
      const { nodes, edges } = get();

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
          title: mergeCommit.message || 'Merge commit',
          summary: `${mergeCommit.content.sentences.length} sentences`,
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
          sourceExcerpt: mergeCommit.content.sentences.map((s) => s.text),
          mustHave:
            mergeCommit.content.constraints
              ?.filter((c) => c.type === 'require')
              .map((c) => c.value) ?? undefined,
          mustntHave:
            mergeCommit.content.constraints
              ?.filter((c) => c.type === 'exclude')
              .map((c) => c.value) ?? undefined,
          // V4 commit data including merge summary
          commitV4: {
            hash: mergeCommit.hash,
            schema: 't3x/commit/v4' as const,
            author: { type: 'human' as const, ...mergeCommit.author },
            committed_at: mergeCommit.committed_at,
            content: { sentences: mergeCommit.content.sentences },
            message: mergeCommit.message,
            branch: mergeCommit.branch,
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

      // Update state with new node and edges
      set({
        nodes: [...nodes, mergeNode],
        edges: [...edges, ...newEdges],
        mergeState: null,
        mergeLoading: false,
        mergeError: null,
      });

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
 * Can the merge be executed? (all similar pairs resolved)
 */
export const selectCanExecuteMerge = (state: CanvasState) => {
  if (!state.mergeState) return false;
  return state.mergeState.prepared.similarPairs.every((p) => p.resolution !== undefined);
};

/**
 * How many similar pairs are unresolved?
 */
export const selectUnresolvedCount = (state: CanvasState) => {
  if (!state.mergeState) return 0;
  return state.mergeState.prepared.similarPairs.filter((p) => p.resolution === undefined).length;
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
    identical: prepared.identical.length,
    similar: prepared.similarPairs.length,
    onlyInSource: prepared.onlyInSource.length,
    onlyInTarget: prepared.onlyInTarget.length,
    resolved: prepared.similarPairs.filter((p) => p.resolution).length,
  };
};
