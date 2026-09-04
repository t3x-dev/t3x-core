import { useCallback, useState } from 'react';
import { reparseMaterial } from '@/queries/materials';
import type { MaterialDetail } from '@/types/api';

export interface UseMaterialReparseResult {
  reparsing: boolean;
  reparse: (projectId: string, materialId: string) => Promise<MaterialDetail>;
}

export function useMaterialReparse(): UseMaterialReparseResult {
  const [reparsing, setReparsing] = useState(false);

  const reparse = useCallback(async (projectId: string, materialId: string) => {
    setReparsing(true);
    try {
      return await reparseMaterial(projectId, materialId);
    } finally {
      setReparsing(false);
    }
  }, []);

  return { reparsing, reparse };
}
