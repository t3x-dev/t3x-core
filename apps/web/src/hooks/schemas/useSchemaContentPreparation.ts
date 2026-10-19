'use client';

import type { SchemaPreparationApplyInput, SchemaPreparationInput } from '@t3x-dev/api-client';
import { useCallback } from 'react';
import {
  applySchemaContentPreparation,
  previewSchemaContentPreparation,
} from '@/infrastructure/schemaStudio';

export function useSchemaContentPreparation(projectId: string, workspaceId: string) {
  const preview = useCallback(
    (input: SchemaPreparationInput) =>
      previewSchemaContentPreparation(projectId, workspaceId, input),
    [projectId, workspaceId]
  );
  const prepare = useCallback(
    (input: SchemaPreparationApplyInput) =>
      applySchemaContentPreparation(projectId, workspaceId, input),
    [projectId, workspaceId]
  );
  return { preview, prepare };
}
