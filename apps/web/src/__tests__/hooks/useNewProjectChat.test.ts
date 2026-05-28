// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNewProjectChat } from '@/hooks/conversations/useNewProjectChat';
import { listCommits } from '@/infrastructure/commits';
import {
  createConversation,
  deleteConversation,
  listConversations,
} from '@/infrastructure/conversations';
import { cleanupRoots, renderHook } from './renderHook';

vi.mock('@/infrastructure/commits', () => ({
  listCommits: vi.fn(),
}));

vi.mock('@/infrastructure/conversations', () => ({
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  listConversations: vi.fn(),
}));

afterEach(() => {
  cleanupRoots();
  vi.clearAllMocks();
});

describe('useNewProjectChat', () => {
  it('reuses the latest uncommitted project conversation and removes extra empty drafts', async () => {
    vi.mocked(listConversations).mockResolvedValue({
      conversations: [
        {
          conversation_id: 'conv_old_empty',
          project_id: 'proj_1',
          title: 'New Chat',
          turns_count: 0,
          created_at: '2026-05-25T00:00:00.000Z',
        },
        {
          conversation_id: 'conv_with_messages',
          project_id: 'proj_1',
          title: 'Asked about routing',
          turns_count: 1,
          created_at: '2026-05-25T00:03:00.000Z',
        },
        {
          conversation_id: 'conv_latest_empty',
          project_id: 'proj_1',
          title: 'New Chat',
          turns_count: 0,
          created_at: '2026-05-25T00:02:00.000Z',
        },
      ],
      limit: 100,
      offset: 0,
    });
    vi.mocked(listCommits).mockResolvedValue([]);
    vi.mocked(deleteConversation).mockResolvedValue({
      deleted: true,
      conversation_id: 'conv_old_empty',
    });

    const { result } = renderHook(() => useNewProjectChat());

    let conversationId: string | null = null;
    await act(async () => {
      conversationId = await result.current.start('proj_1');
    });

    expect(conversationId).toBe('conv_with_messages');
    expect(deleteConversation).toHaveBeenCalledWith('conv_old_empty');
    expect(deleteConversation).toHaveBeenCalledWith('conv_latest_empty');
    expect(createConversation).not.toHaveBeenCalled();
  });

  it('creates a New Chat from the active branch head when no draft exists', async () => {
    vi.mocked(listConversations).mockResolvedValue({
      conversations: [
        {
          conversation_id: 'conv_committed',
          project_id: 'proj_1',
          title: 'Committed source',
          committed_as: null,
          turns_count: 2,
          created_at: '2026-05-25T00:00:00.000Z',
        },
      ],
      limit: 100,
      offset: 0,
    });
    vi.mocked(listCommits).mockImplementation(async (_projectId, branch, _limit) =>
      branch === 'feature'
        ? [
            {
              hash: 'sha256:feature123456',
              message: 'Feature head',
              branch: 'feature',
              committed_at: '2026-05-25T00:01:00.000Z',
              sources: [],
            },
          ]
        : [
            {
              hash: 'sha256:main123456',
              message: 'Main latest',
              branch: 'main',
              committed_at: '2026-05-25T00:00:00.000Z',
              sources: [{ type: 'conversation', id: 'conv_committed' }],
            },
          ]
    );
    vi.mocked(createConversation).mockResolvedValue({
      conversation_id: 'conv_new',
      project_id: 'proj_1',
      title: 'New Chat',
      parent_commit_hash: 'sha256:feature123456',
      created_at: '2026-05-25T00:01:00.000Z',
    });

    const { result } = renderHook(() => useNewProjectChat());

    let conversationId: string | null = null;
    await act(async () => {
      conversationId = await result.current.start('proj_1', 'feature');
    });

    expect(conversationId).toBe('conv_new');
    expect(listCommits).toHaveBeenCalledWith('proj_1', undefined, 100);
    expect(listCommits).toHaveBeenCalledWith('proj_1', 'feature', 1);
    expect(createConversation).toHaveBeenCalledWith(
      'proj_1',
      'New Chat',
      'sha256:feature123456',
      undefined,
      { target_branch: 'feature' }
    );
  });
});
