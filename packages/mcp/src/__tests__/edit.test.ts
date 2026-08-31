import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiClient = vi.hoisted(() => ({ proposeTransition: vi.fn() }));
vi.mock('@t3x-dev/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@t3x-dev/api-client')>()),
  createClient: vi.fn(() => mockApiClient),
}));

import { editHandler } from '../tools/core/edit.js';

const originalBackend = process.env.T3X_MCP_BACKEND;

describe('t3x_edit handler', () => {
  beforeEach(() => {
    process.env.T3X_MCP_BACKEND = 'api';
    mockApiClient.proposeTransition.mockReset();
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
