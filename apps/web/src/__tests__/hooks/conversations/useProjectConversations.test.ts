// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listConversations: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock('@/infrastructure/conversations', () => ({
  deleteConversation: mocks.deleteConversation,
  listConversations: mocks.listConversations,
}));

vi.mock('@/commands/conversations', () => ({
  updateConversation: vi.fn(),
}));

import { useProjectConversations } from '@/hooks/conversations/useProjectConversations';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useProjectConversations', () => {
  it('records project load errors without throwing an unhandled rejection', async () => {
    mocks.listConversations.mockRejectedValueOnce(new Error('Failed to fetch'));

    const { result } = renderHook(() => useProjectConversations());

    let conversations: unknown;
    await act(async () => {
      conversations = await result.current.load('proj_offline');
    });

    expect(conversations).toEqual([]);
    expect(result.current.errorsByProject.proj_offline).toBe('Failed to fetch');
  });
});
