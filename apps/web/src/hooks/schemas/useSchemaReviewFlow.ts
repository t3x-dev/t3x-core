'use client';

import { useMemo } from 'react';
import {
  applySchemaContentPreparation,
  previewSchemaContentPreparation,
  previewStudioSelection,
  readStudioSchemaEditCandidate,
} from '@/infrastructure/schemaStudio';
import {
  ensureSchemaAuthoring,
  prepareSchemaWorkspaceReview,
} from '@/infrastructure/schemaWorkspaceReview';

export function useSchemaReviewFlow(projectId: string) {
  return useMemo(
    () => ({
      readEdit: (workspaceId: string) => readStudioSchemaEditCandidate(projectId, workspaceId),
      ensureAuthoring: (workspaceId: string) => ensureSchemaAuthoring(projectId, workspaceId),
      preview: (input: Parameters<typeof previewStudioSelection>[1]) =>
        previewStudioSelection(projectId, input),
      previewContent: (
        workspaceId: string,
        input: Parameters<typeof previewSchemaContentPreparation>[2]
      ) => previewSchemaContentPreparation(projectId, workspaceId, input),
      prepareContent: (
        workspaceId: string,
        input: Parameters<typeof applySchemaContentPreparation>[2]
      ) => applySchemaContentPreparation(projectId, workspaceId, input),
      review: (workspaceId: string) => prepareSchemaWorkspaceReview(projectId, workspaceId),
    }),
    [projectId]
  );
}
