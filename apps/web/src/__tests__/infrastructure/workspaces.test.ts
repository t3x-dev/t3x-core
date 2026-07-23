import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCandidate } from '@/types/workspaces';

const fetchWithTimeoutMock = vi.fn();
const handleResponseMock = vi.fn();

vi.mock('@/infrastructure/core', () => ({
  API_V1: 'https://api.test/api/v1',
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
  handleResponse: (...args: unknown[]) => handleResponseMock(...args),
}));

import {
  commitProjectWorkspace,
  listProjectWorkspaces,
  saveProjectWorkspace,
} from '@/infrastructure/workspaces';

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

  it('commits a workspace through the workspace-scoped route', async () => {
    const response = new Response('{}');
    const content = {
      relations: [],
      trees: [{ key: 'prd', slots: { title: 'PRD audience handoff' }, children: [] }],
    };

    fetchWithTimeoutMock.mockResolvedValueOnce(response);
    handleResponseMock.mockResolvedValueOnce({
      candidate_id: 'candidate:workspace_prd_handoff',
      commit: { hash: 'sha256:workspace-commit' },
      workspace: { id: 'workspace_prd_handoff' },
    });

    await expect(
      commitProjectWorkspace(
        'proj/with space',
        'workspace/prd handoff',
        content,
        'Workspace commit: PRD audience handoff'
      )
    ).resolves.toEqual({
      candidate_id: 'candidate:workspace_prd_handoff',
      commit: { hash: 'sha256:workspace-commit' },
      workspace: { id: 'workspace_prd_handoff' },
    });

    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://api.test/api/v1/projects/proj%2Fwith%20space/workspaces/workspace%2Fprd%20handoff/commit',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, message: 'Workspace commit: PRD audience handoff' }),
      })
    );
    expect(handleResponseMock).toHaveBeenCalledWith(response);
  });

  it('includes an explicit schema review override in a workspace commit request', async () => {
    const response = new Response('{}');
    const content = {
      relations: [],
      trees: [{ key: 'prd', slots: { title: 'Draft PRD' }, children: [] }],
    };
    const validationOverride = {
      kind: 'schema_review' as const,
      reason: 'User explicitly confirmed unresolved schema review gaps.',
      blockers: ['Schema review gap: requirements.trip.acceptance'],
    };

    fetchWithTimeoutMock.mockResolvedValueOnce(response);
    handleResponseMock.mockResolvedValueOnce({
      candidate_id: 'candidate:workspace_prd_handoff',
      commit: { hash: 'sha256:workspace-commit' },
      workspace: { id: 'workspace_prd_handoff' },
    });

    await commitProjectWorkspace(
      'proj_1',
      'workspace_prd_handoff',
      content,
      'Workspace commit: Draft PRD',
      validationOverride
    );

    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://api.test/api/v1/projects/proj_1/workspaces/workspace_prd_handoff/commit',
      expect.objectContaining({
        body: JSON.stringify({
          content,
          message: 'Workspace commit: Draft PRD',
          validationOverride,
        }),
      })
    );
  });
});
