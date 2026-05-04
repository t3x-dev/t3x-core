// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sourceGoldEditMock = vi.fn();
const commitGoldEditMock = vi.fn();
const replayAppendedMock = vi.fn();
const replayMock = vi.fn();

vi.mock('@/commands/yops/goldEditBuilder', () => ({
  sourceGoldEdit: (...args: unknown[]) => sourceGoldEditMock(...args),
  commitGoldEdit: (...args: unknown[]) => commitGoldEditMock(...args),
}));

vi.mock('@/queries/loadConversation', () => ({
  replayAppended: (...args: unknown[]) => replayAppendedMock(...args),
}));

vi.mock('@/domain/replay', () => ({
  replay: (...args: unknown[]) => replayMock(...args),
}));

import { useGoldEdit } from '@/hooks/shared/useGoldEdit';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('useGoldEdit.applyEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
    useWorkspaceStore.getState().setConversation('conv_123');
    useWorkspaceStore
      .getState()
      .setTurns([{ turn_hash: 'sha256:t1', role: 'user', content: 'hello' }]);
    replayAppendedMock.mockReturnValue({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map(),
      opsLog: [],
    });
    replayMock.mockReturnValue({ tree: { trees: [], relations: [] }, sourceIndex: new Map() });
    commitGoldEditMock.mockResolvedValue(undefined);
  });

  it('threads the same SourcedYOp through optimistic replay and the server commit', async () => {
    // The architectural invariant we're locking down: source is built ONCE
    // per edit, and the same value flows through both the optimistic
    // replay (UI) and the server commit (DB). If the persist path
    // re-derived source, the `at` timestamp would drift and refresh would
    // hydrate a sourceIndex that doesn't match the pre-refresh local state.
    const sourced = {
      unset: { path: 'trip/style' },
      source: {
        type: 'human' as const,
        author: 'ethan',
        at: '2026-04-25T12:00:00.000Z',
        surface: 'tree' as const,
      },
    };
    sourceGoldEditMock.mockReturnValue(sourced);

    const { result } = renderHook(() => useGoldEdit());

    await act(async () => {
      await result.current.applyEdit({ unset: { path: 'trip/style' } });
    });

    expect(sourceGoldEditMock).toHaveBeenCalledTimes(1);

    // The op passed to replayAppended carries the *same source instance*
    // as the op passed to commitGoldEdit.
    const optimisticOps = replayAppendedMock.mock.calls[0][2];
    const persistedSourcedOp = commitGoldEditMock.mock.calls[0][1];
    expect(optimisticOps[0].source).toBe(sourced.source);
    expect(persistedSourcedOp.source).toBe(sourced.source);
    expect(optimisticOps[0].source).toMatchObject({ type: 'human', surface: 'tree' });
    expect(persistedSourcedOp.source).toMatchObject({ type: 'human', surface: 'tree' });
    expect(optimisticOps[0]).toBe(persistedSourcedOp);
  });

  it('rolls back the optimistic update when commit fails', async () => {
    const sourced = {
      set: { path: 'x', value: 1 },
      source: { type: 'human' as const, author: 'ethan', at: '2026-04-25T12:00:00.000Z' },
    };
    sourceGoldEditMock.mockReturnValue(sourced);
    commitGoldEditMock.mockRejectedValue(new Error('persist fail'));

    const { result } = renderHook(() => useGoldEdit());

    await expect(
      act(async () => {
        await result.current.applyEdit({ set: { path: 'x', value: 1 } });
      })
    ).rejects.toThrow('persist fail');

    // Replay was invoked on the rollback path with the pre-edit opsLog
    // (an empty array here since the store was just reset).
    expect(replayMock).toHaveBeenCalled();
    expect(useWorkspaceStore.getState().lastError).toMatch(/persist fail/);
  });

  it('is a no-op when no conversation is active', async () => {
    useWorkspaceStore.getState().setConversation(null);
    const { result } = renderHook(() => useGoldEdit());

    await act(async () => {
      await result.current.applyEdit({ unset: { path: 'x' } });
    });

    expect(sourceGoldEditMock).not.toHaveBeenCalled();
    expect(replayAppendedMock).not.toHaveBeenCalled();
    expect(commitGoldEditMock).not.toHaveBeenCalled();
  });
});
