import { useCallback } from 'react';
import { updateProject as updateProjectCommand } from '@/commands/projects';
import { withProjectDefaultSchemaBinding } from '@/domain/workspaces/schemaBindings';
import { useProjectStore } from '@/store/projectStore';
import { useProjectWorkspaceSchemaBindingsStore } from '@/store/projectWorkspaceSchemaBindingsStore';
import type { WorkspaceSchemaBinding } from '@/types/workspaces';

export function useProjectSchemaDefault() {
  const bindSchema = useProjectWorkspaceSchemaBindingsStore((state) => state.bindSchema);

  return useCallback(
    async (
      projectId: string,
      projectMetadata: Record<string, unknown> | undefined,
      binding: WorkspaceSchemaBinding
    ) => {
      const nextMetadata = withProjectDefaultSchemaBinding(projectMetadata, binding);
      await updateProjectCommand(projectId, { metadata: nextMetadata });
      useProjectStore.getState().updateProject(projectId, { metadata: nextMetadata });
      bindSchema({ binding, projectId, scope: 'project_default' });
      return nextMetadata;
    },
    [bindSchema]
  );
}
