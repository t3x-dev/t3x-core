'use client';

import { useEffect, useState } from 'react';
import { getMaterialDetail } from '@/infrastructure/materials';

const cache = new Map<string, Promise<string | null>>();

function loadMaterialImage(projectId: string, materialId: string): Promise<string | null> {
  const key = `${projectId}:${materialId}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = getMaterialDetail(projectId, materialId)
      .then((detail) =>
        detail.source_type === 'image' && detail.mime_type
          ? `data:${detail.mime_type};base64,${detail.content_text}`
          : null
      )
      .catch(() => {
        cache.delete(key);
        return null;
      });
    cache.set(key, pending);
  }
  return pending;
}

/** Data URL for a saved image attachment; `src` short-circuits for session previews. */
export function useMaterialImageSrc(image: {
  src?: string;
  material?: { projectId: string; materialId: string };
}): string | null {
  const [loaded, setLoaded] = useState<string | null>(null);
  const projectId = image.material?.projectId;
  const materialId = image.material?.materialId;
  useEffect(() => {
    if (image.src || !projectId || !materialId) return;
    let active = true;
    void loadMaterialImage(projectId, materialId).then((src) => {
      if (active) setLoaded(src);
    });
    return () => {
      active = false;
    };
  }, [image.src, materialId, projectId]);
  return image.src ?? loaded;
}
