/**
 * useCanvasMergeActions — view-facing API for two-way merge flows that
 * cross the I/O boundary (@/commands/merge.prepareMerge, executeMerge).
 *
 * Per docs/frontend-architecture-v2-zh.md §2.5, async actions live in
 * hooks. The slice retains merge state + passive setters
 * (setMergePrepared, appendMergeCommit, setMergeLoading, setMergeError)
 * that these methods call after the API resolves.
 */

import type { MergeSummaryData } from '@t3x-dev/core';
import type { Edge, Node } from '@xyflow/react';
import { useCallback } from 'react';
import { executeMerge, prepareMerge } from '@/commands/merge';
import { computeMergeNodePosition } from '@/domain/canvasLayout';
import { getTerminology } from '@/hooks/useTerminology';
import { useCanvasStore } from '@/store/canvasStore';
import { edgeStyle, edgeType } from '@/store/canvasStoreUtils';
import { isDeveloperMode } from '@/store/shared';
import type { CanvasNodeData } from '@/types/nodes';

interface MergeCommitResult {
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
}

export function useCanvasMergeActions() {
  const prepare = useCallback(async (sourceHash: string, targetHash: string): Promise<void> => {
    const { notifyCallback } = useCanvasStore.getState();

    useCanvasStore.getState().setMergeLoading(true);
    useCanvasStore.getState().setMergeError(null);

    try {
      const data = await prepareMerge(sourceHash, targetHash);
      useCanvasStore.getState().setMergePrepared({ sourceHash, targetHash, prepared: data });
      notifyCallback?.('Merge prepared successfully', 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      useCanvasStore.getState().setMergeLoading(false);
      useCanvasStore.getState().setMergeError(errorMessage);
      notifyCallback?.(`Failed to prepare merge: ${errorMessage}`, 'error');
      throw error;
    }
  }, []);

  const execute = useCallback(async (message: string): Promise<MergeCommitResult> => {
    const { mergeState, notifyCallback } = useCanvasStore.getState();

    if (!mergeState) {
      const errorMsg = 'No merge in progress';
      useCanvasStore.getState().setMergeError(errorMsg);
      notifyCallback?.(errorMsg, 'error');
      throw new Error(errorMsg);
    }

    useCanvasStore.getState().setMergeLoading(true);
    useCanvasStore.getState().setMergeError(null);

    try {
      const targetBranch = mergeState.targetBranch || 'main';

      const mergeCommit = (await executeMerge({
        source_hash: mergeState.sourceHash,
        target_hash: mergeState.targetHash,
        prepared: mergeState.prepared,
        message,
        branch: targetBranch,
      })) as unknown as MergeCommitResult;

      const { nodes } = useCanvasStore.getState();
      const sourceNode = nodes.find((n) => n.id === mergeState.sourceHash);
      const targetNode = nodes.find((n) => n.id === mergeState.targetHash);
      const mergeNodePosition = computeMergeNodePosition(sourceNode, targetNode);

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
          commitStatus: 'committed',
          commitHash: mergeCommit.hash,
          isMergeCommit: true,
          branchType: (mergeCommit.branch || targetBranch) === 'main' ? 'main' : 'branch',
          branchName:
            (mergeCommit.branch || targetBranch) !== 'main'
              ? mergeCommit.branch || targetBranch
              : undefined,
          sourceExcerpt:
            mergeCommit.content.trees?.map(
              (f: { type?: string; slots?: Record<string, unknown> }) =>
                `[${f.type}] ${Object.entries(f.slots || {})
                  .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : String(v)}`)
                  .join('; ')}`
            ) ?? [],
          mustHave: undefined,
          mustntHave: undefined,
          commit: {
            hash: mergeCommit.hash,
            schema: 't3x/commit' as const,
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

      const newEdges: Edge[] = mergeCommit.parents.map((parentHash, idx) => ({
        id: `merge-edge-${parentHash}-${mergeCommit.hash}-${idx}`,
        source: parentHash,
        target: mergeCommit.hash,
        type: edgeType,
        animated: false,
        style: edgeStyle,
      }));

      useCanvasStore.getState().appendMergeCommit(mergeNode, newEdges);
      notifyCallback?.('Merge executed successfully', 'success');
      return mergeCommit;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      useCanvasStore.getState().setMergeLoading(false);
      useCanvasStore.getState().setMergeError(errorMessage);
      notifyCallback?.(`Failed to execute merge: ${errorMessage}`, 'error');
      throw error;
    }
  }, []);

  return { prepare, execute };
}
