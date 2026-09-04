/**
 * useMaterialUpload — write helper for uploading project source materials.
 */

import { useCallback, useState } from 'react';
import { createUrlMaterial, uploadDocumentMaterial } from '@/infrastructure/materials';
import type { Material } from '@/types/api';

export interface UseMaterialUploadResult {
  uploading: boolean;
  upload: (projectId: string, file: File) => Promise<Material>;
  uploadUrl: (projectId: string, url: string, title?: string) => Promise<Material>;
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

  const uploadUrl = useCallback(async (projectId: string, url: string, title?: string) => {
    setUploading(true);
    try {
      return await createUrlMaterial(projectId, {
        url,
        ...(title?.trim() ? { title: title.trim() } : {}),
      });
    } finally {
      setUploading(false);
    }
  }, []);

  return { uploading, upload, uploadUrl };
}
