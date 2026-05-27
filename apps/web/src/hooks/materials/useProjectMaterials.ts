/**
 * useProjectMaterials — read-only project material list for chat Sources.
 */

import { useCallback, useEffect, useState } from 'react';
import { fetchMaterialsByProject } from '@/queries/materials';
import type { Material } from '@/types/api';

export interface UseProjectMaterialsResult {
  materials: Material[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useProjectMaterials(
  projectId: string | null | undefined,
  enabled = true
): UseProjectMaterialsResult {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId || !enabled) {
      setMaterials([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchMaterialsByProject(projectId);
      setMaterials(data);
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

  return { materials, loading, error, refresh };
}
