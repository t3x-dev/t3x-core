import { create } from 'zustand';
import {
  EMPTY_PROJECT_WORKSPACE_SCHEMA_BINDINGS,
  type ProjectWorkspaceSchemaBindings,
  type WorkspaceSchemaBindingScope,
} from '@/domain/workspaces/schemaBindings';
import type { WorkspaceSchemaBinding } from '@/types/workspaces';

interface ProjectWorkspaceSchemaBindingsState {
  bindingsByProjectId: Record<string, ProjectWorkspaceSchemaBindings>;
  bindSchema: (input: {
    binding: WorkspaceSchemaBinding;
    projectId: string;
    scope: WorkspaceSchemaBindingScope;
    workspaceId?: string;
  }) => void;
}

export const useProjectWorkspaceSchemaBindingsStore = create<ProjectWorkspaceSchemaBindingsState>(
  (set) => ({
    bindingsByProjectId: {},
    bindSchema: ({ binding, projectId, scope, workspaceId }) =>
      set((state) => {
        const previous =
          state.bindingsByProjectId[projectId] ?? EMPTY_PROJECT_WORKSPACE_SCHEMA_BINDINGS;
        const next: ProjectWorkspaceSchemaBindings =
          scope === 'project_default'
            ? {
                ...previous,
                projectDefault: binding,
              }
            : {
                ...previous,
                byWorkspaceId: workspaceId
                  ? {
                      ...previous.byWorkspaceId,
                      [workspaceId]: binding,
                    }
                  : previous.byWorkspaceId,
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
