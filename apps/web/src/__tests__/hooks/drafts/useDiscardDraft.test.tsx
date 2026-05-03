// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hydrateMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock('@/hooks/conversations/hydrateConversationToStore', () => ({
  hydrateConversationToStore: (...args: unknown[]) => hydrateMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccessMock(...args) },
}));

const chatStoreState: { activeProjectId: string | null } = { activeProjectId: 'proj_abc' };
vi.mock('@/store/chatStore', () => ({
  useChatStore: Object.assign(() => undefined, {
    getState: () => chatStoreState,
  }),
}));

import { useDiscardDraft } from '@/hooks/drafts/useDiscardDraft';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('useDiscardDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
    chatStoreState.activeProjectId = 'proj_abc';
    useWorkspaceStore.getState().setConversation('conv_xyz');
    hydrateMock.mockResolvedValue(undefined);
  });
  afterEach(() => {
    useWorkspaceStore.getState().reset();
  });

  it('clears the draft, hydrates the conversation, and toasts success', async () => {
    const op = {
      set: { path: 'a/b', value: 'x' },
      source: { type: 'human' as const, author: 'u', at: '2026-04-26T00:00:00Z' },
    };
    useWorkspaceStore.getState().setDraft({
      ops: [op] as never,
      tree: { trees: [], relations: [] },
    });
    expect(useWorkspaceStore.getState().hasDraft).toBe(true);

    const { result } = renderHook(() => useDiscardDraft());
    await result.current();

    const after = useWorkspaceStore.getState();
    expect(after.hasDraft).toBe(false);
    expect(after.draftOps).toEqual([]);
    expect(hydrateMock).toHaveBeenCalledWith('proj_abc', 'conv_xyz');
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it('is a no-op when no project is active', async () => {
    chatStoreState.activeProjectId = null;
    const { result } = renderHook(() => useDiscardDraft());
    await result.current();
    expect(hydrateMock).not.toHaveBeenCalled();
  });

  it('is a no-op when no conversation is active', async () => {
    useWorkspaceStore.getState().setConversation(null);
    const { result } = renderHook(() => useDiscardDraft());
    await result.current();
    expect(hydrateMock).not.toHaveBeenCalled();
  });

  it("doesn't fire while a commit is in flight (mode=committing)", async () => {
    useWorkspaceStore.getState().setMode('committing');
    const { result } = renderHook(() => useDiscardDraft());
    await result.current();
    expect(hydrateMock).not.toHaveBeenCalled();
  });
});
