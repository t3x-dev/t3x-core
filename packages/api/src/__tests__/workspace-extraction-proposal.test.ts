import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => ({
  findConversationById: vi.fn(),
  findTurnsByConversation: vi.fn(),
  upsertWorkspaceDraft: vi.fn(),
}));
const extractionMock = vi.hoisted(() => ({ runApiExtractionV2: vi.fn() }));
const transitionMock = vi.hoisted(() => ({ resolveWorkspaceExtractionContext: vi.fn() }));

vi.mock('@t3x-dev/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@t3x-dev/storage')>()),
  ...storageMock,
}));
vi.mock('../lib/extraction-v2', () => extractionMock);
vi.mock('../lib/workspace-transition', () => transitionMock);

import {
  createWorkspaceExtractionProposal,
  type WorkspaceExtractionProposalError,
} from '../lib/workspace-extraction-proposal';

describe('Workspace extraction proposal service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transitionMock.resolveWorkspaceExtractionContext.mockResolvedValue({
      baseline: { trees: [], relations: [] },
      refHead: null,
      refName: 'main',
      workspace: { id: 'workspace_1', projectId: 'proj_1', title: 'Reviewed PRD' },
      workspaceRevision: 3,
      workspaceUpdatedAt: '2026-08-05T00:00:00.000Z',
    });
    storageMock.findConversationById.mockResolvedValue({
      conversationId: 'conv_1',
      projectId: 'proj_1',
    });
    storageMock.findTurnsByConversation.mockResolvedValue([
      { turnHash: 'turn_a', role: 'user', content: 'Build an audit log.' },
      { turnHash: 'turn_b', role: 'assistant', content: 'Use immutable events.' },
    ]);
    extractionMock.runApiExtractionV2.mockResolvedValue({
      ok: true,
      mode: 'bootstrap',
      snapshot: {
        trees: [{ key: 'prd', slots: { title: 'Audit log' }, children: [] }],
        relations: [],
      },
      ops: [
        {
          set: { path: 'prd/title', value: 'Audit log' },
          source: {
            type: 'llm',
            provider: 'test',
            model: 'test',
            turn_hash: 'turn_a',
            quote: 'audit log',
          },
        },
      ],
      lastTurnHash: 'turn_b',
    });
    storageMock.upsertWorkspaceDraft.mockImplementation((_db, input) =>
      Promise.resolve({ workspace_state: input.workspace_state, revision: 4 })
    );
  });

  it('re-resolves immutable turns and persists full SourcedYOps against the ref baseline', async () => {
    const result = await createWorkspaceExtractionProposal({} as never, {
      projectId: 'proj_1',
      workspaceId: 'workspace_1',
      source: { type: 'conversation', id: 'conv_1', turnHashes: ['turn_b', 'turn_a'] },
      expectedRevision: 3,
      actor: { kind: 'agent', id: 'agent:api-key:ak_1' },
    });

    expect(transitionMock.resolveWorkspaceExtractionContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ expectedRevision: 3 })
    );
    expect(extractionMock.runApiExtractionV2).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv_1',
        turnHashes: ['turn_b', 'turn_a'],
        baselineSnapshot: { trees: [], relations: [] },
      })
    );
    expect(result.proposal).toMatchObject({
      schema: 't3x.dev/workspace-extraction-proposal/v1',
      sourceSelector: {
        type: 'conversation',
        id: 'conv_1',
        turnHashes: ['turn_a', 'turn_b'],
      },
      actor: { kind: 'agent', id: 'agent:api-key:ak_1' },
      operations: [
        expect.objectContaining({
          source: expect.objectContaining({ turn_hash: 'turn_a', quote: 'audit log' }),
        }),
      ],
    });
    expect(storageMock.upsertWorkspaceDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        project_id: 'proj_1',
        workspace_id: 'workspace_1',
        workspace_state: expect.objectContaining({ extractionProposal: result.proposal }),
      }),
      3
    );
  });

  it('rejects a Source conversation from another project before calling the LLM', async () => {
    storageMock.findConversationById.mockResolvedValueOnce({
      conversationId: 'conv_other',
      projectId: 'proj_other',
    });

    await expect(
      createWorkspaceExtractionProposal({} as never, {
        projectId: 'proj_1',
        workspaceId: 'workspace_1',
        source: { type: 'conversation', id: 'conv_other', turnHashes: ['turn_a'] },
        actor: { kind: 'agent', id: 'agent:api-key:ak_1' },
      })
    ).rejects.toMatchObject<Partial<WorkspaceExtractionProposalError>>({
      kind: 'source_project_mismatch',
    });
    expect(extractionMock.runApiExtractionV2).not.toHaveBeenCalled();
  });

  it('fails closed when any selected immutable turn hash cannot be resolved', async () => {
    await expect(
      createWorkspaceExtractionProposal({} as never, {
        projectId: 'proj_1',
        workspaceId: 'workspace_1',
        source: {
          type: 'conversation',
          id: 'conv_1',
          turnHashes: ['turn_a', 'turn_missing'],
        },
        actor: { kind: 'agent', id: 'agent:api-key:ak_1' },
      })
    ).rejects.toMatchObject<Partial<WorkspaceExtractionProposalError>>({
      kind: 'source_selector_invalid',
      details: { missing_turn_hashes: ['turn_missing'] },
    });
    expect(extractionMock.runApiExtractionV2).not.toHaveBeenCalled();
  });
});
