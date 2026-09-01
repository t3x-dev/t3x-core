import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiClient = vi.hoisted(() => ({
  workspaces: { createExtractionProposal: vi.fn() },
}));
vi.mock('@t3x-dev/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@t3x-dev/api-client')>()),
  createClient: vi.fn(() => mockApiClient),
}));

import { extractHandler } from '../tools/core/extract.js';

const originalBackend = process.env.T3X_MCP_BACKEND;

describe('t3x_extract handler', () => {
  beforeEach(() => {
    process.env.T3X_MCP_BACKEND = 'api';
    mockApiClient.workspaces.createExtractionProposal.mockReset();
  });
  afterEach(() => {
    if (originalBackend === undefined) delete process.env.T3X_MCP_BACKEND;
    else process.env.T3X_MCP_BACKEND = originalBackend;
  });

  it('requires a complete immutable Source selector', async () => {
    const result = await extractHandler({ project_id: 'proj_1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('workspace_id');
  });

  it('requires the API authority boundary', async () => {
    process.env.T3X_MCP_BACKEND = 'storage';
    const result = await extractHandler({
      project_id: 'proj_1',
      workspace_id: 'workspace_1',
      source_thread_id: 'conv_1',
      turn_hashes: ['sha256:turn-1'],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('T3X_MCP_BACKEND=api');
  });

  it('creates a server-owned Workspace extraction proposal', async () => {
    mockApiClient.workspaces.createExtractionProposal.mockResolvedValue({
      candidate_id: 'candidate_1',
    });
    const result = await extractHandler({
      project_id: 'proj_1',
      workspace_id: 'workspace_1',
      source_thread_id: 'conv_1',
      turn_hashes: ['sha256:turn-1'],
      if_revision: 3,
      provider: 'openai',
      model: 'gpt-5.4',
    });

    expect(result.isError).toBeUndefined();
    expect(mockApiClient.workspaces.createExtractionProposal).toHaveBeenCalledWith(
      'proj_1',
      'workspace_1',
      {
        source: {
          type: 'conversation',
          id: 'conv_1',
          turn_hashes: ['sha256:turn-1'],
        },
        if_revision: 3,
        provider: 'openai',
        model: 'gpt-5.4',
      }
    );
  });
});
