import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiClient = vi.hoisted(() => ({ commitTransition: vi.fn() }));
vi.mock('@t3x-dev/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@t3x-dev/api-client')>()),
  createClient: vi.fn(() => mockApiClient),
}));

import { commitHandler } from '../tools/core/commit.js';

const originalBackend = process.env.T3X_MCP_BACKEND;

describe('t3x_commit handler', () => {
  beforeEach(() => {
    process.env.T3X_MCP_BACKEND = 'api';
    mockApiClient.commitTransition.mockReset();
  });
  afterEach(() => {
    if (originalBackend === undefined) delete process.env.T3X_MCP_BACKEND;
    else process.env.T3X_MCP_BACKEND = originalBackend;
  });

  it('requires a Decision digest and exact expected head', async () => {
    const result = await commitHandler({ project_id: 'proj_1', transition_id: 'trn_1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('decision_digest');
  });

  it('delegates to canonical CommitV2 authority', async () => {
    mockApiClient.commitTransition.mockResolvedValue({ transition_id: 'trn_1' });
    const result = await commitHandler({
      project_id: 'proj_1',
      transition_id: 'trn_1',
      request_id: 'req_1',
      decision_digest: 'sha256:decision',
      expected_head: null,
    });

    expect(result.isError).toBeUndefined();
    expect(mockApiClient.commitTransition).toHaveBeenCalledWith('proj_1', 'trn_1', {
      request_id: 'req_1',
      decision_digest: 'sha256:decision',
      expected_head: null,
    });
  });
});
