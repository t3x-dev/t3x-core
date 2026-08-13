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
      binding: { schemaName: 'Docker Compose', version: 'v2', mode: 'pinned' },
    });

    expect(
      useProjectWorkspaceSchemaBindingsStore.getState().bindingsByProjectId.proj_1.byWorkspaceId
        .workspace_prd
    ).toEqual({ schemaName: 'Docker Compose', version: 'v2', mode: 'pinned' });
  });

  it('tracks exact bindings independently for each Workspace', () => {
    const store = useProjectWorkspaceSchemaBindingsStore.getState();
    store.bindSchema({
      projectId: 'proj_1',
      workspaceId: 'workspace_prd',
      binding: { schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' },
    });
    store.bindSchema({
      projectId: 'proj_1',
      workspaceId: 'workspace_docs',
      binding: { schemaName: 'Docker Compose', version: 'v2', mode: 'pinned' },
    });

    expect(useProjectWorkspaceSchemaBindingsStore.getState().bindingsByProjectId.proj_1).toEqual({
      byWorkspaceId: {
        workspace_prd: { schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' },
        workspace_docs: { schemaName: 'Docker Compose', version: 'v2', mode: 'pinned' },
      },
    });
  });
});
