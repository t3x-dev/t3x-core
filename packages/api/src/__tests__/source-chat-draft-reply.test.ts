import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => ({
  findConversationById: vi.fn(),
  findTurnsByHashes: vi.fn(),
  recordUsage: vi.fn(),
}));
const providerMock = vi.hoisted(() => ({ resolveProviderAndModel: vi.fn() }));
const transitionMock = vi.hoisted(() => ({ resolveWorkspaceExtractionContext: vi.fn() }));
const yschemaMock = vi.hoisted(() => ({ resolveWorkspaceYSchema: vi.fn() }));

vi.mock('@t3x-dev/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@t3x-dev/storage')>()),
  ...storageMock,
}));
vi.mock('../lib/provider-resolver', () => providerMock);
vi.mock('../lib/workspace-transition', () => transitionMock);
vi.mock('../lib/workspace-yschema', () => yschemaMock);

import {
  createInferenceRuntime,
  InferenceAdmissionDeniedError,
  type InferenceAdmissionPolicy,
} from '../lib/inference';
import { createSourceChatDraftReply } from '../lib/source-chat-draft-reply';

describe('createSourceChatDraftReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transitionMock.resolveWorkspaceExtractionContext.mockResolvedValue({
      baseline: {
        trees: [{ key: 'prd', slots: { summary: 'Existing summary' }, children: [] }],
        relations: [],
      },
      refHead: null,
      refName: 'main',
      workspace: { id: 'workspace_1', projectId: 'proj_1', title: 'Source draft' },
      workspaceRevision: 3,
      workspaceUpdatedAt: '2026-08-17T00:00:00.000Z',
    });
    yschemaMock.resolveWorkspaceYSchema.mockResolvedValue({ canonicalName: null, schema: null });
    storageMock.findConversationById.mockResolvedValue({
      conversationId: 'conv_1',
      projectId: 'proj_1',
    });
    storageMock.findTurnsByHashes.mockResolvedValue([
      {
        turnHash: 'turn_user_1',
        role: 'user',
        content: 'Use audit trail as the proposal summary.',
      },
    ]);
    storageMock.recordUsage.mockResolvedValue(undefined);
  });

  it('lets the provider bind source items by catalog target_id', async () => {
    const authorize = vi.fn(async () => ({
      outcome: 'admitted' as const,
      admission: { id: 'admission_source_draft' },
    }));
    const settle = vi.fn<InferenceAdmissionPolicy['settle']>();
    const runtime = createInferenceRuntime({
      createGenerationId: () => 'gen_source_draft',
      admissionPolicy: { authorize, settle, release: vi.fn() },
    });
    const generateStructured = vi.fn(async () => ({
      data: {
        schema: 't3x/source-chat-draft-reply',
        version: 1,
        source_items: [
          {
            kind: 'captured',
            title: 'Proposal summary',
            content: 'Use audit trail as the proposal summary.',
            target_id: 'T001',
            target_path: null,
            source_quote: 'Use audit trail as the proposal summary.',
          },
        ],
        warnings: [],
      },
      usage: { inputTokens: 11, outputTokens: 13 },
    }));
    providerMock.resolveProviderAndModel.mockResolvedValue({
      ok: true,
      providerId: 'google-ai',
      provider: { generateStructured },
      model: 'gemini-3.6-flash',
    });

    const result = await createSourceChatDraftReply({} as never, {
      projectId: 'proj_1',
      workspaceId: 'workspace_1',
      conversationId: 'conv_1',
      userTurnHash: 'turn_user_1',
      provider: 'google',
      model: 'gemini-3.6-flash',
      expectedRevision: 3,
      inference: {
        runtime,
        runId: 'request:req_source_draft',
        scope: {
          actor: { kind: 'user', id: 'user_1' },
          namespaceId: 'ns_1',
          projectId: 'proj_1',
          projectVisibility: 'unknown',
        },
      },
    });

    expect(generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining('"target_id": "T001"'),
          }),
        ],
      }),
      expect.anything(),
      expect.objectContaining({ model: 'gemini-3.6-flash' })
    );
    expect(result.source_items).toEqual([
      expect.objectContaining({
        id: 'S001',
        kind: 'captured',
        target_id: 'T001',
        target_path: 'prd/summary',
        source_quote: 'Use audit trail as the proposal summary.',
        source_turn_hash: 'turn_user_1',
      }),
    ]);
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: 'gen_source_draft',
        runId: 'request:req_source_draft',
        feature: 'source-chat.draft-reply',
        requestedModel: 'gemini-3.6-flash',
        scope: expect.objectContaining({ namespaceId: 'ns_1', projectId: 'proj_1' }),
      })
    );
    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({
        terminal: expect.objectContaining({
          kind: 'receipt',
          receipt: expect.objectContaining({
            resolvedProvider: 'google-ai',
            resolvedModel: 'gemini-3.6-flash',
            usage: { inputTokens: 11, outputTokens: 13 },
          }),
        }),
      })
    );
  });

  it('does not invoke the provider after admission denial', async () => {
    const generateStructured = vi.fn();
    providerMock.resolveProviderAndModel.mockResolvedValue({
      ok: true,
      providerId: 'google-ai',
      provider: { generateStructured },
      model: 'gemini-3.6-flash',
    });
    const runtime = createInferenceRuntime({
      createGenerationId: () => 'gen_denied',
      admissionPolicy: {
        async authorize() {
          return { outcome: 'denied', code: 'quota_exhausted', reason: 'No grant remains' };
        },
        settle: vi.fn(),
        release: vi.fn(),
      },
    });

    await expect(
      createSourceChatDraftReply({} as never, {
        projectId: 'proj_1',
        workspaceId: 'workspace_1',
        conversationId: 'conv_1',
        userTurnHash: 'turn_user_1',
        inference: {
          runtime,
          runId: 'request:req_denied',
          scope: { actor: { kind: 'user', id: 'user_1' }, projectId: 'proj_1' },
        },
      })
    ).rejects.toBeInstanceOf(InferenceAdmissionDeniedError);
    expect(generateStructured).not.toHaveBeenCalled();
  });
});
