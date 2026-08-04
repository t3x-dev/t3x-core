import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectWorkspaceSchemaBindingsStore } from '@/store/projectWorkspaceSchemaBindingsStore';

beforeEach(() => {
  useProjectWorkspaceSchemaBindingsStore.setState({ bindingsByProjectId: {} });
});

describe('project workspace schema bindings store', () => {
  it('keeps workspace schema bindings outside route component state', () => {
    useProjectWorkspaceSchemaBindingsStore.getState().bindSchema({
      projectId: 'proj_1',
      workspaceId: 'workspace_prd',
      scope: 'current_workspace',
      binding: { schemaName: 'Docker Compose', version: 'v2', mode: 'pinned' },
    });

    expect(
      useProjectWorkspaceSchemaBindingsStore.getState().bindingsByProjectId.proj_1.byWorkspaceId
        .workspace_prd
    ).toEqual({ schemaName: 'Docker Compose', version: 'v2', mode: 'pinned' });
  });

  it('tracks project default bindings separately from pinned workspace bindings', () => {
    const store = useProjectWorkspaceSchemaBindingsStore.getState();
    store.bindSchema({
      projectId: 'proj_1',
      workspaceId: 'workspace_prd',
      scope: 'current_workspace',
      binding: { schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' },
    });
    store.bindSchema({
      projectId: 'proj_1',
      scope: 'project_default',
      binding: { schemaName: 'Docker Compose', version: 'v2', mode: 'project_default' },
    });

    expect(useProjectWorkspaceSchemaBindingsStore.getState().bindingsByProjectId.proj_1).toEqual({
      projectDefault: { schemaName: 'Docker Compose', version: 'v2', mode: 'project_default' },
      byWorkspaceId: {
        workspace_prd: { schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' },
      },
    });
  });
});
