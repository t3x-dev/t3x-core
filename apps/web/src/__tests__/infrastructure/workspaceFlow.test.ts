import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCandidate } from '@/types/workspaces';

const createExtractionProposalMock = vi.fn();
const fetchWithTimeoutMock = vi.fn();
const handleResponseMock = vi.fn();

vi.mock('@/infrastructure/core', () => ({
  API_V1: 'https://api.test/api/v1',
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
  handleResponse: (...args: unknown[]) => handleResponseMock(...args),
}));

vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({
    workspaces: {
      createExtractionProposal: (...args: unknown[]) => createExtractionProposalMock(...args),
    },
  }),
}));

import { extractWorkspaceCandidate } from '@/infrastructure/workspaceFlow';

describe('infrastructure/workspaceFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the server-owned extraction proposal path for immutable chat turns', async () => {
    const workspace = workspaceCandidate({
      sourceBundle: [
        {
          id: 'source_chat:conv_1',
          type: 'chat',
          title: 'Source chat',
          conversationId: 'conv_1',
          previewTurns: [
            { id: 'turn_1', role: 'user', author: 'User', content: 'Need quieter logs.' },
            { id: 'turn_2', role: 'assistant', author: 'AI', content: 'Set logger to INFO.' },
          ],
        },
      ],
    });
    createExtractionProposalMock.mockResolvedValueOnce({
      candidate_id: 'candidate:v2',
      workspace: { id: 'workspace/1', projectId: 'proj/1', revision: 8 },
    });

    await expect(extractWorkspaceCandidate(workspace)).resolves.toEqual({
      candidate_id: 'candidate:v2',
      workspace: { id: 'workspace/1', projectId: 'proj/1', revision: 8 },
    });

    expect(createExtractionProposalMock).toHaveBeenCalledWith('proj/1', 'workspace/1', {
      source: { type: 'conversation', id: 'conv_1', turn_hashes: ['turn_1', 'turn_2'] },
      if_revision: 7,
    });
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
  });

  it('keeps the legacy extract-candidate fallback for preview material sources', async () => {
    const response = new Response('{}');
    const workspace = workspaceCandidate({
      sourceBundle: [
        {
          id: 'src_text',
          type: 'text',
          title: 'Pasted source',
          previewText: 'Audience: operators.',
        },
      ],
    });
    fetchWithTimeoutMock.mockResolvedValueOnce(response);
    handleResponseMock.mockResolvedValueOnce({
      candidate_id: 'candidate:legacy',
      workspace: { id: 'workspace/1', projectId: 'proj/1', revision: 8 },
    });

    await expect(extractWorkspaceCandidate(workspace)).resolves.toEqual({
      candidate_id: 'candidate:legacy',
      workspace: { id: 'workspace/1', projectId: 'proj/1', revision: 8 },
    });

    expect(createExtractionProposalMock).not.toHaveBeenCalled();
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://api.test/api/v1/projects/proj%2F1/workspaces/workspace%2F1/extract-candidate',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetchWithTimeoutMock.mock.calls[0]?.[1].body);
    expect(body.if_revision).toBe(7);
    expect(body.sources).toEqual([expect.objectContaining({ id: 'src_text' })]);
  });

  it('keeps every source when chat and material evidence are mixed', async () => {
    const response = new Response('{}');
    const workspace = workspaceCandidate({
      sourceBundle: [
        {
          id: 'source_chat:conv_1',
          type: 'chat',
          title: 'Source chat',
          conversationId: 'conv_1',
          previewTurns: [
            { id: 'turn_1', role: 'user', author: 'User', content: 'Audience is operators.' },
          ],
        },
        {
          id: 'material:mat_1',
          type: 'document',
          title: 'Requirements',
          materialId: 'mat_1',
          previewText: 'Outcome is fewer failed deployments.',
        },
      ],
    });
    fetchWithTimeoutMock.mockResolvedValueOnce(response);
    handleResponseMock.mockResolvedValueOnce({
      candidate_id: 'candidate:mixed',
      workspace: { id: 'workspace/1', projectId: 'proj/1', revision: 8 },
    });

    await extractWorkspaceCandidate(workspace, { provider: 'openai', model: 'gpt-5.4-mini' });

    expect(createExtractionProposalMock).not.toHaveBeenCalled();
    const body = JSON.parse(fetchWithTimeoutMock.mock.calls[0]?.[1].body);
    expect(body.sources).toEqual([
      expect.objectContaining({ id: 'source_chat:conv_1' }),
      expect.objectContaining({ id: 'material:mat_1' }),
    ]);
  });
});

function workspaceCandidate(input: {
  sourceBundle: WorkspaceCandidate['sourceBundle'];
}): WorkspaceCandidate {
  return {
    id: 'workspace/1',
    projectId: 'proj/1',
    title: 'Workspace',
    status: 'draft',
    revision: 7,
    baseCommitHash: null,
    targetBranch: 'main',
    sourceBundle: input.sourceBundle,
    schemaBindings: [],
    schemaCandidate: { summary: '', fields: [] },
    schemaReview: { verdict: 'needs_review', summary: '', gaps: [] },
    yopsDraft: { id: 'draft', operations: [] },
    outputTargets: [],
  };
}
