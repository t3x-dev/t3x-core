import { useCallback, useState } from 'react';
import { archiveProjectMaterial } from '@/infrastructure/materials';
import type { MaterialDetail } from '@/types/api';

export interface UseMaterialArchiveResult {
  archiving: boolean;
  archiveMaterial: (projectId: string, materialId: string) => Promise<MaterialDetail>;
}

export function useMaterialArchive(): UseMaterialArchiveResult {
  const [archiving, setArchiving] = useState(false);

  const archiveMaterial = useCallback(async (projectId: string, materialId: string) => {
    setArchiving(true);
    try {
      return await archiveProjectMaterial(projectId, materialId);
    } finally {
      setArchiving(false);
    }
  }, []);

  return { archiving, archiveMaterial };
}
