// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConversation, deleteConversation } from '@/commands/conversations';
import { useTemporaryChatImport } from '@/hooks/conversations/useTemporaryChatImport';
import { createTurn } from '@/infrastructure/turns';
import { cleanupRoots, renderHook } from './renderHook';

vi.mock('@/commands/conversations', () => ({
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock('@/infrastructure/turns', () => ({
  createTurn: vi.fn(),
}));

afterEach(() => {
  cleanupRoots();
  vi.clearAllMocks();
});

describe('useTemporaryChatImport', () => {
  const project = {
    project_id: 'proj_1',
    name: 'Imported Project',
    created_at: '2026-05-25T00:00:00.000Z',
  };

  const chat = {
    id: 'temp_1',
    title: 'Imported source',
    messages: [
      {
        id: 'msg_user',
        role: 'user' as const,
        content: 'hello',
        createdAt: '2026-05-25T00:01:00.000Z',
      },
      {
        id: 'msg_assistant',
        role: 'assistant' as const,
        content: 'hi',
        createdAt: '2026-05-25T00:02:00.000Z',
      },
    ],
    createdAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T00:02:00.000Z',
  };

  it('creates the imported conversation from the selected parent commit and preserves turns', async () => {
    vi.mocked(createConversation).mockResolvedValue({
      conversation_id: 'conv_imported',
      project_id: 'proj_1',
      title: 'Imported source',
      parent_commit_hash: 'sha256:parent',
      created_at: '2026-05-25T00:03:00.000Z',
    });
    vi.mocked(createTurn).mockResolvedValue({ turn_hash: 'sha256:turn' });

    const { result } = renderHook(() => useTemporaryChatImport());

    await act(async () => {
      await result.current.importChat({
        chat,
        project,
        parentCommitHash: 'sha256:parent',
      });
    });

    expect(createConversation).toHaveBeenCalledWith('proj_1', 'Imported source', 'sha256:parent');
    expect(createTurn).toHaveBeenNthCalledWith(1, 'proj_1', 'conv_imported', 'user', 'hello');
    expect(createTurn).toHaveBeenNthCalledWith(2, 'proj_1', 'conv_imported', 'assistant', 'hi');
  });

  it('removes the created conversation if turn import fails', async () => {
    vi.mocked(createConversation).mockResolvedValue({
      conversation_id: 'conv_imported',
      project_id: 'proj_1',
      title: 'Imported source',
      created_at: '2026-05-25T00:03:00.000Z',
    });
    vi.mocked(createTurn).mockRejectedValue(new Error('turn failed'));
    vi.mocked(deleteConversation).mockResolvedValue({
      deleted: true,
      conversation_id: 'conv_imported',
    });

    const { result } = renderHook(() => useTemporaryChatImport());

    await expect(
      result.current.importChat({ chat, project, parentCommitHash: 'sha256:parent' })
    ).rejects.toThrow('turn failed');

    expect(deleteConversation).toHaveBeenCalledWith('conv_imported');
  });
});
