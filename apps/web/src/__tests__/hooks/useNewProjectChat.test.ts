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
  it('reuses the latest empty New Chat draft and removes older empty drafts', async () => {
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
          title: 'New Chat',
          turns_count: 1,
          created_at: '2026-05-25T00:01:00.000Z',
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
    vi.mocked(deleteConversation).mockResolvedValue({
      deleted: true,
      conversation_id: 'conv_old_empty',
    });

    const { result } = renderHook(() => useNewProjectChat());

    let conversationId: string | null = null;
    await act(async () => {
      conversationId = await result.current.start('proj_1');
    });

    expect(conversationId).toBe('conv_latest_empty');
    expect(deleteConversation).toHaveBeenCalledWith('conv_old_empty');
    expect(createConversation).not.toHaveBeenCalled();
    expect(listCommits).not.toHaveBeenCalled();
  });

  it('creates a New Chat when no empty project draft exists', async () => {
    vi.mocked(listConversations).mockResolvedValue({
      conversations: [],
      limit: 100,
      offset: 0,
    });
    vi.mocked(listCommits).mockResolvedValue([
      {
        hash: 'sha256:abcdef123456',
        message: 'Latest',
        branch: 'main',
        committed_at: '2026-05-25T00:00:00.000Z',
      },
    ]);
    vi.mocked(createConversation).mockResolvedValue({
      conversation_id: 'conv_new',
      project_id: 'proj_1',
      title: 'New Chat',
      parent_commit_hash: 'sha256:abcdef123456',
      created_at: '2026-05-25T00:01:00.000Z',
    });

    const { result } = renderHook(() => useNewProjectChat());

    let conversationId: string | null = null;
    await act(async () => {
      conversationId = await result.current.start('proj_1');
    });

    expect(conversationId).toBe('conv_new');
    expect(createConversation).toHaveBeenCalledWith('proj_1', 'New Chat', 'sha256:abcdef123456');
  });
});
