'use client';

/**
 * usePendingCommitPostCommit — post-commit success-page handlers and
 * the "open as draft" entry. Split from usePendingCommitState (PR25).
 */

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useCanvasNodeActions } from '@/hooks/useCanvasNodeActions';
import * as api from '@/infrastructure';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData } from '@/types/nodes';

interface UsePendingCommitPostCommitProps {
  projectId: string;
  node: { id?: string; data: CanvasNodeData } | null | undefined;
  onClose: () => void;
  onConvertDraft: (() => void) | undefined;
  commitHash: string | undefined;
  data: CanvasNodeData;
}

export interface UsePendingCommitPostCommitReturn {
  openingAsDraft: boolean;
  handleSuccessClose: () => void;
  handleViewCommitDetails: () => void;
  handleCreateOutput: () => void;
  handleOpenAsDraft: () => Promise<void>;
}

export function usePendingCommitPostCommit({
  projectId,
  node,
  onClose,
  onConvertDraft,
  commitHash,
  data,
}: UsePendingCommitPostCommitProps): UsePendingCommitPostCommitReturn {
  const { load: loadCanvas } = useCanvasNodeActions();
  const [openingAsDraft, setOpeningAsDraft] = useState(false);

  const handleSuccessClose = useCallback(() => {
    void loadCanvas(projectId);
    onClose();
  }, [projectId, onClose, loadCanvas]);

  const handleViewCommitDetails = useCallback(() => {
    void loadCanvas(projectId);
    onConvertDraft?.();
  }, [projectId, onConvertDraft, loadCanvas]);

  const handleCreateOutput = useCallback(() => {
    void loadCanvas(projectId);
    onConvertDraft?.();
    if (node?.id) {
      queueMicrotask(() => {
        useCanvasStore.getState().openLeafPanel(commitHash || node.id!);
      });
    }
  }, [projectId, onConvertDraft, node?.id, commitHash, loadCanvas]);

  const handleOpenAsDraft = useCallback(async () => {
    setOpeningAsDraft(true);
    try {
      const newDraft = await api.createWorkbenchDraft({
        project_id: projectId,
        title: data.title || 'Draft from Canvas',
        parent_commit_hash: data.sourceCommitHash || undefined,
        target_branch:
          data.pendingBranch === 'branch' ? data.pendingBranchName || 'branch' : 'main',
      });

      const routeProject = data.projectId || projectId;
      window.location.href = `/project/${routeProject}/draft/${newDraft.id}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create draft');
    } finally {
      setOpeningAsDraft(false);
    }
  }, [projectId, data]);

  return {
    openingAsDraft,
    handleSuccessClose,
    handleViewCommitDetails,
    handleCreateOutput,
    handleOpenAsDraft,
  };
}
