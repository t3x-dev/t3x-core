'use client';
import type { StudioPublishInput } from '@t3x-dev/api-client';
import { useCallback } from 'react';
import { publishStudioSchema } from '@/infrastructure/schemaStudio';

export function usePublishStudioSchema(projectId: string, workspaceId: string) {
  return useCallback(
    (input: StudioPublishInput) => publishStudioSchema(projectId, workspaceId, input),
    [projectId, workspaceId]
  );
}
