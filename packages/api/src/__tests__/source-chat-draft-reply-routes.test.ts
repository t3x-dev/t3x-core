import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => ({
  findProjectById: vi.fn((_db, projectId: string) => Promise.resolve({ projectId, ownerId: null })),
}));

const draftReplyMock = vi.hoisted(() => ({ createSourceChatDraftReply: vi.fn() }));
const sourceDraftReplyContent = [
  'Source draft',
  [
    'I organized your message into source-ready material for the proposal step.',
    'Captured items can be reused downstream; boundaries and open questions stay separate for review.',
    'Summary: 1 captured item, 0 boundaries, 0 confirmation items.',
  ].join('\n'),
  'Captured\n- Review notes: Use review notes only.',
].join('\n\n');

vi.mock('../lib/db', () => ({ getDB: vi.fn(() => Promise.resolve({})) }));
vi.mock('@t3x-dev/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@t3x-dev/storage')>()),
  ...storageMock,
}));
vi.mock('../lib/source-chat-draft-reply', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/source-chat-draft-reply')>()),
  createSourceChatDraftReply: draftReplyMock.createSourceChatDraftReply,
}));

import { sourceChatDraftReplyRoutes } from '../routes/source-chat-draft-replies.openapi';

function app() {
  const instance = new Hono();
  instance.route('/', sourceChatDraftReplyRoutes);
  return instance;
}

const path = '/v1/projects/proj_1/workspaces/workspace_1/source-chat/draft-reply';

describe('Source Chat draft reply routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    draftReplyMock.createSourceChatDraftReply.mockResolvedValue({
      content: sourceDraftReplyContent,
      display: {
        captured: ['Review notes: Use review notes only.'],
        excluded: [],
        needs_confirmation: [],
      },
      model: 'gemini-3.6-flash',
      provider: 'google-ai',
      source_items: [
        {
          id: 'S001',
          kind: 'captured',
          title: 'Review notes',
          content: 'Use review notes only.',
          source_quote: 'Use review notes only.',
          source_turn_hash: 'sha256:user_turn',
        },
      ],
      warnings: [],
    });
  });

  it('creates a bounded Source Chat reply from the saved user turn', async () => {
    const response = await app().request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: 'conv_1',
        user_turn_hash: 'sha256:user_turn',
        provider: 'google',
        model: 'gemini-3.6-flash',
        if_revision: 7,
      }),
    });

    expect(response.status).toBe(200);
    expect(draftReplyMock.createSourceChatDraftReply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectId: 'proj_1',
        workspaceId: 'workspace_1',
        conversationId: 'conv_1',
        userTurnHash: 'sha256:user_turn',
        provider: 'google',
        model: 'gemini-3.6-flash',
        expectedRevision: 7,
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        content: sourceDraftReplyContent,
        source_items: [{ id: 'S001', kind: 'captured' }],
      },
    });
  });

  it('rejects client-supplied extra fields before generation', async () => {
    const response = await app().request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: 'conv_1',
        user_turn_hash: 'sha256:user_turn',
        actor: { kind: 'agent', id: 'forged' },
      }),
    });

    expect(response.status).toBe(400);
    expect(draftReplyMock.createSourceChatDraftReply).not.toHaveBeenCalled();
  });
});
