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
  decideProjectWorkspaceSourceTransition,
  decideProjectWorkspaceTransition,
  listProjectWorkspaces,
  reviewProjectWorkspaceSourceTransition,
  reviewProjectWorkspaceTransition,
  saveProjectWorkspace,
} from '@/infrastructure/workspaces';
import { WORKSPACE_SOURCE_ARTIFACT_FORMAT } from '@/types/workspaces';

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

  it('requests a Transition review with content, rationale, and revision only', async () => {
    const response = new Response('{}');
    const content = {
      relations: [],
      trees: [{ key: 'prd', slots: { title: 'Reviewed PRD' }, children: [] }],
    };
    fetchWithTimeoutMock.mockResolvedValueOnce(response);
    handleResponseMock.mockResolvedValueOnce({ transition: { mode: 'transition' } });

    await reviewProjectWorkspaceTransition(
      'proj/with space',
      'workspace/prd handoff',
      content,
      'Keep the audience current.',
      7
    );

    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://api.test/api/v1/projects/proj%2Fwith%20space/workspaces/workspace%2Fprd%20handoff/transition/review',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          why: 'Keep the audience current.',
          if_revision: 7,
        }),
      })
    );
  });

  it('decides with the immutable precondition and no client authority fields', async () => {
    const response = new Response('{}');
    const content = {
      relations: [],
      trees: [{ key: 'prd', slots: { title: 'Reviewed PRD' }, children: [] }],
    };
    const precondition = {
      workspace_revision: 7,
      ref_head: null,
      effect_digest: `sha256:${'a'.repeat(64)}`,
      proposal_digest: `sha256:${'b'.repeat(64)}`,
      statement_digests: [`sha256:${'c'.repeat(64)}`],
      policy_digest: `sha256:${'d'.repeat(64)}`,
    };
    fetchWithTimeoutMock.mockResolvedValueOnce(response);
    handleResponseMock.mockResolvedValueOnce({ transition: { mode: 'transition' } });

    await decideProjectWorkspaceTransition('proj_1', 'workspace_prd_handoff', {
      content,
      why: 'Keep the audience current.',
      outcome: 'overridden',
      decisionReason: 'The known gap is acceptable for this draft.',
      precondition,
    });

    const body = JSON.parse(String(fetchWithTimeoutMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      content,
      why: 'Keep the audience current.',
      outcome: 'overridden',
      decision_reason: 'The known gap is acceptable for this draft.',
      precondition,
    });
    expect(body).not.toHaveProperty('actor');
    expect(body).not.toHaveProperty('issuer');
    expect(body).not.toHaveProperty('policy');
    expect(body).not.toHaveProperty('capabilities');
    expect(body).not.toHaveProperty('result');
  });

  it('reviews an exact-source import with selectors instead of source bytes or authority facts', async () => {
    const response = new Response('{}');
    const artifact = {
      format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
      rootPath: 'device.yaml',
      root: { materialId: 'mat_root', contentHash: 'hash:root' },
      resources: [
        {
          path: 'packages/common.yaml',
          materialId: 'mat_common',
          contentHash: 'hash:common',
        },
      ],
    };
    fetchWithTimeoutMock.mockResolvedValueOnce(response);
    handleResponseMock.mockResolvedValueOnce({ transition: { mode: 'transition' } });

    await reviewProjectWorkspaceSourceTransition('proj/with space', 'workspace/source', {
      artifact,
      change: { mode: 'import', root: artifact.root },
      why: 'Import the existing device configuration.',
      ifRevision: 4,
    });

    const body = JSON.parse(String(fetchWithTimeoutMock.mock.calls[0]?.[1]?.body));
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://api.test/api/v1/projects/proj%2Fwith%20space/workspaces/workspace%2Fsource/source-transition/review',
      expect.objectContaining({ method: 'POST' })
    );
    expect(body).toEqual({
      artifact: {
        format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
        root_path: 'device.yaml',
        resources: [
          {
            path: 'packages/common.yaml',
            material_id: 'mat_common',
            content_hash: 'hash:common',
          },
        ],
      },
      change: {
        mode: 'import',
        root: { material_id: 'mat_root', content_hash: 'hash:root' },
      },
      why: 'Import the existing device configuration.',
      if_revision: 4,
    });
    expect(body).not.toHaveProperty('source');
    expect(body).not.toHaveProperty('actor');
    expect(body).not.toHaveProperty('policy');
    expect(JSON.stringify(body)).not.toContain('secret_value');
  });

  it('decides an exact-source edit with only the reviewed task and opaque precondition', async () => {
    const response = new Response('{}');
    const artifact = {
      format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
      rootPath: 'device.yaml',
      root: { materialId: 'mat_root', contentHash: 'hash:root' },
      resources: [],
    };
    const precondition = {
      workspace_revision: 5,
      ref_head: `sha256:${'a'.repeat(64)}`,
      source_selector_digest: `sha256:${'b'.repeat(64)}`,
      source_input_manifest_digest: null,
      effect_digest: `sha256:${'c'.repeat(64)}`,
      proposal_digest: `sha256:${'d'.repeat(64)}`,
      statement_digests: [`sha256:${'e'.repeat(64)}`],
      policy_digest: `sha256:${'f'.repeat(64)}`,
    };
    fetchWithTimeoutMock.mockResolvedValueOnce(response);
    handleResponseMock.mockResolvedValueOnce({ transition: { mode: 'transition' } });

    await decideProjectWorkspaceSourceTransition('proj_1', 'workspace_source', {
      artifact,
      change: {
        mode: 'edit',
        operations: [
          {
            op: 'replace_scalar',
            path: ['logger', 'level'],
            expect: 'DEBUG',
            value: 'INFO',
          },
        ],
      },
      outcome: 'overridden',
      decisionReason: 'The known environment failure is acceptable for this fixture.',
      precondition,
    });

    const body = JSON.parse(String(fetchWithTimeoutMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      artifact: {
        format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
        root_path: 'device.yaml',
        resources: [],
      },
      change: {
        mode: 'edit',
        operations: [
          {
            op: 'replace_scalar',
            path: ['logger', 'level'],
            expect: 'DEBUG',
            value: 'INFO',
          },
        ],
      },
      outcome: 'overridden',
      decision_reason: 'The known environment failure is acceptable for this fixture.',
      precondition,
    });
    expect(body).not.toHaveProperty('capabilities');
    expect(body).not.toHaveProperty('runner');
    expect(body).not.toHaveProperty('result');
  });
});
