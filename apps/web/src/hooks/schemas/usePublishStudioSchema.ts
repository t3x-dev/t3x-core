'use client';
import type { StudioPublishInput } from '@t3x-dev/api-client';
import { useCallback, useContext } from 'react';
import { publishStudioSchema } from '@/infrastructure/schemaStudio';
import { invalidateStudioPreviews, StudioPreviewCacheContext } from './studioPreviewCache';

export function usePublishStudioSchema(projectId: string, workspaceId: string) {
  const cache = useContext(StudioPreviewCacheContext);
  return useCallback(
    async (input: StudioPublishInput) => {
      const published = await publishStudioSchema(projectId, workspaceId, input);
      if (cache) invalidateStudioPreviews(cache, workspaceId);
      return published;
    },
    [cache, projectId, workspaceId]
  );
}
