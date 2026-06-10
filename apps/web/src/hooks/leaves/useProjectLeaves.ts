/**
 * useProjectLeaves — read-only leaf list for the active chat project.
 *
 * The chat sidebar needs output counts and a first leaf target, but L4
 * components should not call infrastructure directly. Keep the fetch in this
 * L3 hook via the existing query helper.
 */

import { useCallback, useEffect, useState } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import { LEAF_CHANGED_EVENT, type LeafChangedDetail } from '@/hooks/leaves/leafEvents';
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
      setError(formatUserFacingError(err, 'Failed to load leaves.'));
    } finally {
      setLoading(false);
    }
  }, [enabled, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!projectId || !enabled) return;

    const handleLeafChanged = (event: Event) => {
      const detail = (event as CustomEvent<LeafChangedDetail>).detail;
      if (detail?.projectId !== projectId) return;
      void refresh();
    };

    window.addEventListener(LEAF_CHANGED_EVENT, handleLeafChanged);
    return () => window.removeEventListener(LEAF_CHANGED_EVENT, handleLeafChanged);
  }, [enabled, projectId, refresh]);

  return { leaves, loading, error, refresh };
}
