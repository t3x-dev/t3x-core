import type { WorkspaceTransitionReviewSnapshotEnvelope } from '@t3x-dev/api-client';
import { useEffect, useState } from 'react';
import {
  fetchWorkspaceTransitionReviewSnapshot,
  fetchWorkspaceTransitionReviewSnapshots,
} from '@/queries/workspaces';
export function useWorkspaceReviewHistory(
  projectId: string,
  workspaceId: string,
  currentSnapshotId: string | null
) {
  const [history, setHistory] = useState<WorkspaceTransitionReviewSnapshotEnvelope[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] =
    useState<WorkspaceTransitionReviewSnapshotEnvelope | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHistory([]);
    setHistoryError(null);
    setHistoryLoading(true);
    fetchWorkspaceTransitionReviewSnapshots(projectId, workspaceId)
      .then(
        (result) => {
          if (!cancelled) setHistory(result.snapshots);
        },
        (cause: unknown) => {
          if (!cancelled)
            setHistoryError(
              cause instanceof Error ? cause.message : 'Could not load review history'
            );
        }
      )
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, workspaceId, currentSnapshotId]);

  useEffect(() => {
    setSelectedSnapshotId(null);
    setSelectedSnapshot(null);
    setSnapshotError(null);
  }, [projectId, workspaceId]);

  useEffect(() => {
    if (!selectedSnapshotId) return;
    let cancelled = false;
    setSnapshotLoading(true);
    setSnapshotError(null);
    setSelectedSnapshot(null);
    fetchWorkspaceTransitionReviewSnapshot(projectId, workspaceId, selectedSnapshotId)
      .then(
        (result) => {
          if (!cancelled) setSelectedSnapshot(result);
        },
        (cause: unknown) => {
          if (!cancelled)
            setSnapshotError(
              cause instanceof Error ? cause.message : 'Could not load review snapshot'
            );
        }
      )
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, workspaceId, selectedSnapshotId]);

  return {
    history,
    historyError,
    historyLoading,
    selectedSnapshotId,
    setSelectedSnapshotId,
    selectedSnapshot,
    snapshotError,
    snapshotLoading,
  };
}
