import { useCallback, useEffect, useState } from 'react';
import { fetchMaterialDetail } from '@/queries/materials';
import type { MaterialDetail } from '@/types/api';

export interface UseMaterialDetailResult {
  material: MaterialDetail | null;
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error('Failed to load material');
}

export function useMaterialDetail(
  projectId: string | null | undefined,
  materialId: string | null | undefined,
  enabled = true
): UseMaterialDetailResult {
  const [material, setMaterial] = useState<MaterialDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!projectId || !materialId || !enabled) {
      setMaterial(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchMaterialDetail(projectId, materialId);
      setMaterial(data);
    } catch (cause) {
      setMaterial(null);
      setError(toError(cause));
    } finally {
      setLoading(false);
    }
  }, [enabled, materialId, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { material, loading, error, reload: load };
}
