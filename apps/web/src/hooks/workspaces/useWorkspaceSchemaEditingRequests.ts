import { useMemo } from 'react';
import { hasUnappliedSchemaEdit } from '@/domain/workspaces/schemaBindings';
import { readStudioSchemaEditCandidate } from '@/infrastructure/schemaStudio';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';
import { readWorkspaceSchemaEditing } from '@/infrastructure/workspaceSchemaEditing';
import type { WorkspaceCandidate } from '@/types/workspaces';

export type { WorkspaceSchemaEditing } from '@/infrastructure/workspaceSchemaEditing';

export function useWorkspaceSchemaEditingRequests(projectId: string, workspaceId: string) {
  return useMemo(
    () => ({
      read: () => readWorkspaceSchemaEditing(projectId, workspaceId),
      hasPendingEdit: async () => {
        const [saved, edit] = await Promise.all([
          getSharedApiClient().workspaces.get(projectId, workspaceId),
          readStudioSchemaEditCandidate(projectId, workspaceId),
        ]);
        return hasUnappliedSchemaEdit(edit, saved.workspace as unknown as WorkspaceCandidate);
      },
    }),
    [projectId, workspaceId]
  );
}
