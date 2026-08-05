import type { ApiKey } from '@t3x-dev/core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/db', () => ({ getDB: vi.fn(() => Promise.resolve({})) }));
vi.mock('@t3x-dev/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@t3x-dev/storage')>()),
  findProjectById: vi.fn((_db, projectId: string) => Promise.resolve({ projectId, ownerId: null })),
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
});
