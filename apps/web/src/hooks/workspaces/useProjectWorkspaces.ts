import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import { fetchProjectWorkspaces, saveWorkspaceDraft } from '@/queries/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';

export interface UseProjectWorkspacesResult {
  workspaces: WorkspaceCandidate[];
  loading: boolean;
  initialized: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveDraft: (workspace: WorkspaceCandidate) => Promise<WorkspaceCandidate>;
}

export function useProjectWorkspaces(
  projectId: string | null | undefined,
  enabled = true
): UseProjectWorkspacesResult {
  const [workspaces, setWorkspaces] = useState<WorkspaceCandidate[]>([]);
  const [workspacesProjectId, setWorkspacesProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializedProjectId, setInitializedProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!projectId || !enabled) {
      setWorkspaces([]);
      setWorkspacesProjectId(null);
      setError(null);
      setLoading(false);
      setInitializedProjectId(null);
      return;
    }

    setLoading(true);
    setInitializedProjectId(null);
    try {
      const data = await fetchProjectWorkspaces(projectId);
      if (requestId !== requestIdRef.current) return;
      setWorkspaces(data);
      setWorkspacesProjectId(projectId);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(formatUserFacingError(err, 'Failed to load workspaces.'));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setInitializedProjectId(projectId);
      }
    }
  }, [enabled, projectId]);

  useEffect(() => {
    void refresh();
    return () => {
      requestIdRef.current += 1;
    };
  }, [refresh]);

  const saveDraft = useCallback(
    async (workspace: WorkspaceCandidate) => {
      if (!projectId) throw new Error('A project is required to save a workspace.');
      const saved = await saveWorkspaceDraft(projectId, workspace.id, workspace);
      return saved.workspace;
    },
    [projectId]
  );

  return {
    workspaces: workspacesProjectId === projectId ? workspaces : [],
    loading,
    initialized: !enabled || !projectId || initializedProjectId === projectId,
    error,
    refresh,
    saveDraft,
  };
}
