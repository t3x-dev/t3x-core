// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useWorkspaceConversations } from '@/hooks/workspaces/useWorkspaceConversations';
import { fetchConversations } from '@/queries/conversations';

vi.mock('@/queries/conversations', () => ({ fetchConversations: vi.fn() }));

it('loads a single page for the visible sidebar and appends the next page once on demand', async () => {
  const first = Array.from({ length: 20 }, (_, i) => ({
    conversation_id: `chat-${i}`,
    created_at: '2026-11-24',
  }));
  const last = { conversation_id: 'chat-20', created_at: '2026-11-24' };
  vi.mocked(fetchConversations)
    .mockResolvedValueOnce({ conversations: first, limit: 20, offset: 0 })
    .mockResolvedValueOnce({ conversations: [last], limit: 20, offset: 20 });

  const { result, rerender } = renderHook(
    ({ visible }) => useWorkspaceConversations('p', visible),
    {
      initialProps: { visible: false },
    }
  );
  expect(fetchConversations).not.toHaveBeenCalled();
  rerender({ visible: true });
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  expect(fetchConversations).toHaveBeenCalledExactlyOnceWith('p', 20, 0);
  act(() => {
    result.current.loadMore();
    result.current.loadMore();
  });
  await waitFor(() => expect(result.current.data?.conversations).toEqual([...first, last]));
  expect(fetchConversations).toHaveBeenCalledTimes(2);
  expect(fetchConversations).toHaveBeenLastCalledWith('p', 20, 20);
  expect(result.current.hasMore).toBe(false);
});
