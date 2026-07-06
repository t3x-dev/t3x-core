import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCandidate } from '@/types/workspaces';

const fetchWithTimeoutMock = vi.fn();
const handleResponseMock = vi.fn();

vi.mock('@/infrastructure/core', () => ({
  API_V1: 'https://api.test/api/v1',
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
  handleResponse: (...args: unknown[]) => handleResponseMock(...args),
}));

import { listProjectWorkspaces, saveProjectWorkspace } from '@/infrastructure/workspaces';

describe('infrastructure/workspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads encoded project workspaces', async () => {
    const response = new Response('{}');
    const workspaces = [
      {
        id: 'workspace_prd_handoff',
        projectId: 'proj/with space',
        title: 'Persisted workspace',
      },
    ] as WorkspaceCandidate[];

    fetchWithTimeoutMock.mockResolvedValueOnce(response);
    handleResponseMock.mockResolvedValueOnce({ workspaces });

    await expect(listProjectWorkspaces('proj/with space')).resolves.toBe(workspaces);

    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://api.test/api/v1/projects/proj%2Fwith%20space/workspaces'
    );
    expect(handleResponseMock).toHaveBeenCalledWith(response);
  });

  it('saves reviewed workspace state with encoded route ids', async () => {
    const response = new Response('{}');
    const workspace = {
      id: 'workspace_prd_handoff',
      projectId: 'proj/with space',
      title: 'Reviewed workspace',
    } as WorkspaceCandidate;

    fetchWithTimeoutMock.mockResolvedValueOnce(response);
    handleResponseMock.mockResolvedValueOnce({
      candidate_id: 'candidate:workspace_prd_handoff',
      workspace,
    });

    await expect(
      saveProjectWorkspace('proj/with space', 'workspace/prd handoff', workspace)
    ).resolves.toEqual({
      candidate_id: 'candidate:workspace_prd_handoff',
      workspace,
    });

    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://api.test/api/v1/projects/proj%2Fwith%20space/workspaces/workspace%2Fprd%20handoff',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace }),
      })
    );
    expect(handleResponseMock).toHaveBeenCalledWith(response);
  });
});
