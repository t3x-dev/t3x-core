/**
 * useMaterialUpload — write helper for uploading project source materials.
 */

import { useCallback, useState } from 'react';
import { uploadDocumentMaterial } from '@/infrastructure/materials';
import type { Material } from '@/types/api';

export interface UseMaterialUploadResult {
  uploading: boolean;
  upload: (projectId: string, file: File) => Promise<Material>;
}

export function useMaterialUpload(): UseMaterialUploadResult {
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(async (projectId: string, file: File) => {
    setUploading(true);
    try {
      return await uploadDocumentMaterial(projectId, file);
    } finally {
      setUploading(false);
    }
  }, []);

  return { uploading, upload };
}
