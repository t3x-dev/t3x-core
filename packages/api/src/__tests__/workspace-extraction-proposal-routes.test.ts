import type { ApiKey } from '@t3x-dev/core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => ({
  findWorkspaceDraft: vi.fn(),
  listTransitionProposalsForWorkspaceRevision: vi.fn(),
}));

vi.mock('../lib/db', () => ({ getDB: vi.fn(() => Promise.resolve({})) }));
vi.mock('@t3x-dev/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@t3x-dev/storage')>()),
  findProjectById: vi.fn((_db, projectId: string) =>
    Promise.resolve({ projectId, namespaceId: 'ns_test', ownerId: null })
  ),
  findProjectAuthorityFacts: vi.fn(
    (
      _db,
      input: {
        projectId: string;
        principal: { kind: 'human' | 'agent' | 'service'; principalId: string };
      }
    ) =>
      Promise.resolve({
        project: { projectId: input.projectId, namespaceId: 'ns_test', ownerId: null },
        namespaceMembership: null,
        projectGrant: {
          grantId: `grant_${input.principal.principalId}`,
          projectId: input.projectId,
          namespaceId: 'ns_test',
          principalKind: input.principal.kind,
          principalId: input.principal.principalId,
          role: 'editor',
          status: 'active',
          createdAt: new Date('2026-08-31T00:00:00.000Z'),
          updatedAt: new Date('2026-08-31T00:00:00.000Z'),
          revokedAt: null,
        },
      })
  ),
  ...storageMock,
}));

const proposalMock = vi.hoisted(() => ({ createWorkspaceExtractionProposal: vi.fn() }));
vi.mock('../lib/workspace-extraction-proposal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/workspace-extraction-proposal')>()),
  createWorkspaceExtractionProposal: proposalMock.createWorkspaceExtractionProposal,
}));

import { workspaceExtractionProposalRoutes } from '../routes/workspace-extraction-proposals.openapi';

function key(scopes: ApiKey['transition_scopes']): ApiKey {
  return {
    id: 'ak_workspace_extract',
    key_prefix: 't3xk_test',
    key_hash: 'test-hash',
    name: 'Workspace extraction agent',
    project_id: 'proj_1',
    user_id: 'user_1',
    principal_kind: 'agent',
    transition_scopes: scopes,
    created_at: '2026-08-05T00:00:00.000Z',
    last_used_at: null,
    revoked_at: null,
  };
}

function app(apiKey: ApiKey) {
  const instance = new Hono();
  instance.use('*', async (context, next) => {
    context.set('apiKey', apiKey);
    await next();
  });
  instance.route('/', workspaceExtractionProposalRoutes);
  return instance;
}

const path = '/v1/projects/proj_1/workspaces/workspace_1/extraction-proposals';
const linkPath = '/v1/projects/proj_1/workspaces/workspace_1/extraction-transition';
const body = {
  source: { type: 'conversation', id: 'conv_1', turn_hashes: ['turn_1'] },
  if_revision: 2,
};

describe('Workspace extraction proposal routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    proposalMock.createWorkspaceExtractionProposal.mockResolvedValue({
      candidateId: 'candidate:abc',
      proposal: {
        schema: 't3x.dev/workspace-extraction-proposal/v1',
        sourceSelector: { type: 'conversation', id: 'conv_1', turnHashes: ['turn_1'] },
        sourceSelectorDigest: `sha256:${'a'.repeat(64)}`,
        baseCommitHash: null,
        mode: 'bootstrap',
        operations: [],
        result: { trees: [], relations: [] },
        actor: { kind: 'agent', id: 'agent:api-key:ak_workspace_extract' },
        createdAt: '2026-08-05T00:00:00.000Z',
      },
      workspace: { id: 'workspace_1', projectId: 'proj_1', revision: 3 },
    });
    storageMock.findWorkspaceDraft.mockResolvedValue({
      revision: 3,
      workspace_state: { backendCandidateId: 'candidate:abc' },
    });
    storageMock.listTransitionProposalsForWorkspaceRevision.mockResolvedValue([
      {
        transitionId: `trn_${'a'.repeat(32)}`,
        workspaceRevision: 3,
        createdAt: '2026-08-05T00:01:00.000Z',
        requestCanonicalJson: JSON.stringify({
          kind: 'structured_yops',
          source: {
            type: 'workspace_extraction_proposal',
            candidate_id: 'candidate:abc',
          },
        }),
      },
    ]);
  });

  it('derives the proposal actor from an authenticated scoped agent key', async () => {
    const response = await app(key(['transition:propose'])).request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    expect(proposalMock.createWorkspaceExtractionProposal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectId: 'proj_1',
        workspaceId: 'workspace_1',
        expectedRevision: 2,
        source: { type: 'conversation', id: 'conv_1', turnHashes: ['turn_1'] },
        actor: { kind: 'agent', id: 'agent:api-key:ak_workspace_extract' },
        userId: 'user_1',
        inference: expect.objectContaining({
          scope: {
            actor: { kind: 'agent', id: 'agent:api-key:ak_workspace_extract' },
            namespaceId: 'ns_test',
            projectId: 'proj_1',
            projectVisibility: 'unknown',
          },
        }),
      })
    );
  });

  it('rejects an agent key without transition:propose before extraction', async () => {
    const response = await app(key(['transition:inspect'])).request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.objectContaining({ code: 'FORBIDDEN' }) })
    );
    expect(proposalMock.createWorkspaceExtractionProposal).not.toHaveBeenCalled();
  });

  it('rejects client-supplied actor fields', async () => {
    const response = await app(key(['transition:propose'])).request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, actor: { kind: 'human', id: 'forged' } }),
    });

    expect(response.status).toBe(400);
    expect(proposalMock.createWorkspaceExtractionProposal).not.toHaveBeenCalled();
  });

  it('resolves the durable Transition for the current Workspace candidate', async () => {
    const response = await app(key(['transition:inspect'])).request(linkPath);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        transition_id: `trn_${'a'.repeat(32)}`,
        candidate_id: 'candidate:abc',
        workspace_revision: 3,
      },
    });
    expect(storageMock.listTransitionProposalsForWorkspaceRevision).toHaveBeenCalledWith(
      expect.anything(),
      { projectId: 'proj_1', workspaceId: 'workspace_1', workspaceRevision: 3 }
    );
  });

  it('does not link a Transition created for a replaced extraction candidate', async () => {
    storageMock.findWorkspaceDraft.mockResolvedValueOnce({
      revision: 3,
      workspace_state: { backendCandidateId: 'candidate:replaced' },
    });

    const response = await app(key(['transition:inspect'])).request(linkPath);

    expect(response.status).toBe(404);
  });
});
