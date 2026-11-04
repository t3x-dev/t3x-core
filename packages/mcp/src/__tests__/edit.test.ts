import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiClient = vi.hoisted(() => ({
  proposeTransition: vi.fn(),
  workspaces: {
    authoring: {
      initialize: vi.fn(),
      publish: vi.fn(),
      publishSchema: vi.fn(),
      prepareReconciliation: vi.fn(),
      decideReconciliation: vi.fn(),
    },
  },
}));
vi.mock('@t3x-dev/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@t3x-dev/api-client')>()),
  createClient: vi.fn(() => mockApiClient),
}));

import { editHandler } from '../tools/core/edit.js';

const originalBackend = process.env.T3X_MCP_BACKEND;

describe('t3x_edit handler', () => {
  beforeEach(() => {
    process.env.T3X_MCP_BACKEND = 'api';
    vi.resetAllMocks();
  });
  afterEach(() => {
    if (originalBackend === undefined) delete process.env.T3X_MCP_BACKEND;
    else process.env.T3X_MCP_BACKEND = originalBackend;
  });

  it('requires canonical proposal identity and operations', async () => {
    const result = await editHandler({ project_id: 'proj_1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('workspace_id');
  });

  it('delegates to a structured_yops Transition proposal', async () => {
    mockApiClient.proposeTransition.mockResolvedValue({ transition_id: 'trn_1' });
    const operations = [{ set: { path: 'trip/budget', value: 5000 } }];
    const result = await editHandler({
      project_id: 'proj_1',
      workspace_id: 'workspace_1',
      request_id: 'req_1',
      operations,
      if_revision: 2,
      why: 'Refine budget',
    });

    expect(result.isError).toBeUndefined();
    expect(mockApiClient.proposeTransition).toHaveBeenCalledWith('proj_1', {
      kind: 'structured_yops',
      request_id: 'req_1',
      workspace_id: 'workspace_1',
      operations,
      if_revision: 2,
      why: 'Refine budget',
    });
  });
});

describe('immutable Draft commands', () => {
  beforeEach(() => {
    process.env.T3X_MCP_BACKEND = 'api';
    vi.resetAllMocks();
  });
  afterEach(() => {
    if (originalBackend === undefined) delete process.env.T3X_MCP_BACKEND;
    else process.env.T3X_MCP_BACKEND = originalBackend;
  });
  const request = {
    mode: 'draft',
    project_id: 'proj_1',
    workspace_id: 'ws',
    request_id: 'op_1',
    expected_revision: 3,
    expected_workspace_revision: 5,
    expected_ref_head: null,
    operations: [{ set: { path: 'name', value: 'New' } }],
    why: 'Exact requested correction',
  };
  it('uses the common guarded save with both revisions and never proposes or commits', async () => {
    mockApiClient.workspaces.authoring.publish.mockResolvedValue({
      kind: 'published',
      compositionRevision: 4,
      action: { id: 'op_1' },
    });
    const result = await editHandler(request);
    expect(result.isError).toBeUndefined();
    expect(mockApiClient.workspaces.authoring.publish).toHaveBeenCalledWith('proj_1', 'ws', {
      request_id: 'op_1',
      expected_revision: 3,
      expected_workspace_revision: 5,
      expected_ref_head: null,
      operations: request.operations,
      reason: request.why,
    });
    expect(mockApiClient.proposeTransition).not.toHaveBeenCalled();
  });
  it('refuses unguarded saves and storage-only mutation', async () => {
    expect((await editHandler({ ...request, expected_revision: undefined })).isError).toBe(true);
    expect((await editHandler({ ...request, expected_ref_head: undefined })).isError).toBe(true);
    process.env.T3X_MCP_BACKEND = 'storage';
    expect((await editHandler(request)).isError).toBe(true);
    expect(mockApiClient.workspaces.authoring.publish).not.toHaveBeenCalled();
  });
  it('imports an explicit legacy snapshot without inventing old authors', async () => {
    mockApiClient.workspaces.authoring.initialize.mockResolvedValue({ compositionRevision: 1 });
    expect(
      (
        await editHandler({
          ...request,
          mode: 'initialize_draft',
          legacy_document: { name: 'Existing' },
        })
      ).isError
    ).toBeUndefined();
    expect(mockApiClient.workspaces.authoring.initialize).toHaveBeenCalledWith('proj_1', 'ws', {
      request_id: 'op_1',
      expected_workspace_revision: 5,
      expected_ref_head: null,
      legacy_document: { name: 'Existing' },
    });
  });
  it('applies one exact Schema action through the same Workspace authoring API', async () => {
    const settings = {
      action: 'add_slot',
      nodePath: 'product',
      name: 'advantage',
      definition: { type: 'string' },
      intent: 'Add the requested advantage field',
    };
    mockApiClient.workspaces.authoring.publishSchema.mockResolvedValue({ status: 'applied' });
    const result = await editHandler({
      ...request,
      mode: 'schema',
      operations: undefined,
      schema_settings: settings,
    });
    expect(result.isError).toBeUndefined();
    expect(mockApiClient.workspaces.authoring.publishSchema).toHaveBeenCalledWith('proj_1', 'ws', {
      request_id: 'op_1',
      expected_revision: 3,
      expected_workspace_revision: 5,
      expected_ref_head: null,
      settings,
    });
  });
  it('previews and explicitly discards through the shared reconciliation capability', async () => {
    const head = `sha256:${'b'.repeat(64)}`;
    const preparationDigest = `sha256:${'a'.repeat(64)}`;
    mockApiClient.workspaces.authoring.prepareReconciliation.mockResolvedValue({
      preparationDigest,
    });
    expect(
      (
        await editHandler({
          ...request,
          mode: 'sync_preview',
          expected_ref_head: head,
          operations: undefined,
        })
      ).isError
    ).toBeUndefined();
    expect(mockApiClient.workspaces.authoring.prepareReconciliation).toHaveBeenCalledWith(
      'proj_1',
      'ws',
      { expected_workspace_revision: 5, expected_ref_head: head }
    );
    mockApiClient.workspaces.authoring.decideReconciliation.mockResolvedValue({
      kind: 'discarded',
    });
    expect(
      (
        await editHandler({
          ...request,
          mode: 'sync_discard',
          expected_ref_head: head,
          operations: undefined,
          preparation_digest: preparationDigest,
        })
      ).isError
    ).toBeUndefined();
    expect(mockApiClient.workspaces.authoring.decideReconciliation).toHaveBeenCalledWith(
      'proj_1',
      'ws',
      {
        request_id: 'op_1',
        expected_workspace_revision: 5,
        expected_ref_head: head,
        preparation_digest: preparationDigest,
        action: 'discard',
      }
    );
    const conflictId = `sha256:${'c'.repeat(64)}`;
    expect(
      (
        await editHandler({
          ...request,
          mode: 'sync_resolve',
          expected_ref_head: head,
          operations: undefined,
          preparation_digest: preparationDigest,
          resolutions: [{ conflict_id: conflictId, choice: 'theirs' }],
        })
      ).isError
    ).toBeUndefined();
    expect(mockApiClient.workspaces.authoring.decideReconciliation).toHaveBeenLastCalledWith(
      'proj_1',
      'ws',
      {
        request_id: 'op_1',
        expected_workspace_revision: 5,
        expected_ref_head: head,
        preparation_digest: preparationDigest,
        action: 'resolve',
        resolutions: [{ conflict_id: conflictId, choice: 'theirs' }],
      }
    );
  });
});
