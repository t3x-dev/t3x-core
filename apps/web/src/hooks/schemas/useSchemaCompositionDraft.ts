'use client';

import { useCallback } from 'react';
import {
  applyWorkspaceYSchemaComposition,
  publishWorkspaceYSchemaComposition,
  saveWorkspaceYSchemaComposition,
} from '@/infrastructure/schemaComposition';
import type {
  PublishedSchemaVersionManifest,
  PublishSchemaCompositionInput,
  SchemaCompositionDraft,
  WorkspaceSchemaCompositionResult,
} from '@/types/schemaModules';

export function useSchemaCompositionDraft() {
  const save = useCallback(
    (
      projectId: string,
      workspaceId: string,
      composition: SchemaCompositionDraft,
      workspaceRevision: number
    ): Promise<WorkspaceSchemaCompositionResult> =>
      saveWorkspaceYSchemaComposition(projectId, workspaceId, composition, workspaceRevision),
    []
  );

  const apply = useCallback(
    (
      projectId: string,
      workspaceId: string,
      workspaceRevision: number,
      compositionRevision: number,
      compositionHash: string
    ): Promise<WorkspaceSchemaCompositionResult> =>
      applyWorkspaceYSchemaComposition(
        projectId,
        workspaceId,
        workspaceRevision,
        compositionRevision,
        compositionHash
      ),
    []
  );

  const publish = useCallback(
    (
      projectId: string,
      workspaceId: string,
      input: PublishSchemaCompositionInput
    ): Promise<PublishedSchemaVersionManifest> =>
      publishWorkspaceYSchemaComposition(projectId, workspaceId, input),
    []
  );

  return { apply, publish, save };
}
