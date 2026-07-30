import { useCallback, useEffect, useState } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import { fetchProjectWorkspaces } from '@/queries/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';

export interface UseProjectWorkspacesResult {
  workspaces: WorkspaceCandidate[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useProjectWorkspaces(
  projectId: string | null | undefined,
  enabled = true
): UseProjectWorkspacesResult {
  const [workspaces, setWorkspaces] = useState<WorkspaceCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId || !enabled) {
      setWorkspaces([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchProjectWorkspaces(projectId);
      setWorkspaces(data);
      setError(null);
    } catch (err) {
      setError(formatUserFacingError(err, 'Failed to load workspaces.'));
    } finally {
      setLoading(false);
    }
  }, [enabled, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { workspaces, loading, error, refresh };
}
