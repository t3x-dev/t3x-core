/**
 * useProjectLeaves — read-only leaf list for the active chat project.
 *
 * The chat sidebar needs output counts and a first leaf target, but L4
 * components should not call infrastructure directly. Keep the fetch in this
 * L3 hook via the existing query helper.
 */

import { useCallback, useEffect, useState } from 'react';
import { fetchLeavesByProject } from '@/queries/leaves';
import type { Leaf } from '@/types/api';

export interface UseProjectLeavesResult {
  leaves: Leaf[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useProjectLeaves(
  projectId: string | null | undefined,
  enabled = true
): UseProjectLeavesResult {
  const [leaves, setLeaves] = useState<Leaf[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId || !enabled) {
      setLeaves([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchLeavesByProject(projectId);
      setLeaves(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [enabled, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { leaves, loading, error, refresh };
}
