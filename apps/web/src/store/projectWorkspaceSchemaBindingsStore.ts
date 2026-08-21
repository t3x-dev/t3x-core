import { create } from 'zustand';
import {
  EMPTY_PROJECT_WORKSPACE_SCHEMA_BINDINGS,
  type ProjectWorkspaceSchemaBindings,
} from '@/domain/workspaces/schemaBindings';
import type { WorkspaceSchemaBinding } from '@/types/workspaces';

interface ProjectWorkspaceSchemaBindingsState {
  bindingsByProjectId: Record<string, ProjectWorkspaceSchemaBindings>;
  bindSchema: (input: {
    binding: WorkspaceSchemaBinding;
    projectId: string;
    workspaceId: string;
  }) => void;
}

export const useProjectWorkspaceSchemaBindingsStore = create<ProjectWorkspaceSchemaBindingsState>(
  (set) => ({
    bindingsByProjectId: {},
    bindSchema: ({ binding, projectId, workspaceId }) =>
      set((state) => {
        const previous =
          state.bindingsByProjectId[projectId] ?? EMPTY_PROJECT_WORKSPACE_SCHEMA_BINDINGS;
        const next: ProjectWorkspaceSchemaBindings = {
          ...previous,
          byWorkspaceId: {
            ...previous.byWorkspaceId,
            [workspaceId]: binding,
          },
        };

        return {
          bindingsByProjectId: {
            ...state.bindingsByProjectId,
            [projectId]: next,
          },
        };
      }),
  })
);
