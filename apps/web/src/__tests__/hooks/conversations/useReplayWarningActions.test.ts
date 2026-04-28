// @vitest-environment jsdom

import type { SourcedYOp } from '@t3x-dev/core';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const commitOpsMock = vi.fn();
const removeYOpsEntryMock = vi.fn();
const hydrateMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('@/commands/yops/yopsService', () => ({
  commitOps: (...args: unknown[]) => commitOpsMock(...args),
}));

vi.mock('@/infrastructure/yopsLog', () => ({
  removeYOpsEntry: (...args: unknown[]) => removeYOpsEntryMock(...args),
}));

vi.mock('@/hooks/conversations/hydrateConversationToStore', () => ({
  hydrateConversationToStore: (...args: unknown[]) => hydrateMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

const chatStoreState = { activeProjectId: 'proj_abc' as string | null };
vi.mock('@/store/chatStore', () => ({
  useChatStore: Object.assign(() => undefined, {
    getState: () => chatStoreState,
  }),
}));

import { useReplayWarningActions } from '@/hooks/conversations/useReplayWarningActions';
import { useWorkspaceStore } from '@/store/workspaceStore';

const firstOp: SourcedYOp = {
  define: { path: 'trip' },
  source: { type: 'human', author: 'script-editor', at: '2026-04-28T00:00:00Z' },
};

const failingOp: SourcedYOp = {
  define: { path: 'trip' },
  source: { type: 'human', author: 'script-editor', at: '2026-04-28T00:00:00Z' },
};

describe('useReplayWarningActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commitOpsMock.mockResolvedValue({ id: 'yl_repaired' });
    removeYOpsEntryMock.mockResolvedValue(undefined);
    hydrateMock.mockResolvedValue(undefined);
    chatStoreState.activeProjectId = 'proj_abc';
    useWorkspaceStore.getState().reset();
    useWorkspaceStore.getState().setConversation('conv_xyz');
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map(),
      opsLog: [firstOp, failingOp],
    });
    useWorkspaceStore.getState().setReplayWarning({
      opIndex: 1,
      opIndexInRow: 0,
      rowId: 'yl_bad',
      code: 'ALREADY_EXISTS',
      message: 'Path "trip" already exists',
      appliedCount: 1,
    });
  });

  it('removes only the failing op by repairing the active script instead of deleting the row', async () => {
    const { result } = renderHook(() => useReplayWarningActions());

    await act(async () => {
      await (
        result.current as unknown as { removeFailingOp: () => Promise<void> }
      ).removeFailingOp();
    });

    expect(commitOpsMock).toHaveBeenCalledWith('conv_xyz', [firstOp], {
      replaceActiveLLMDraft: false,
      repairYopsLogId: 'yl_bad',
    });
    expect(removeYOpsEntryMock).not.toHaveBeenCalled();
    expect(hydrateMock).toHaveBeenCalledWith('proj_abc', 'conv_xyz');
  });

  it('deletes the failing entry only through the explicit entry-level action', async () => {
    const { result } = renderHook(() => useReplayWarningActions());

    await act(async () => {
      await (
        result.current as unknown as { deleteFailingEntry: () => Promise<void> }
      ).deleteFailingEntry();
    });

    expect(removeYOpsEntryMock).toHaveBeenCalledWith('conv_xyz', 'yl_bad');
    expect(commitOpsMock).not.toHaveBeenCalled();
    expect(hydrateMock).toHaveBeenCalledWith('proj_abc', 'conv_xyz');
  });
});
