// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveGoldEditSourceMock = vi.fn();
const commitGoldEditMock = vi.fn();
const replayMock = vi.fn();

vi.mock('@/commands/yops/goldEditBuilder', () => ({
  resolveGoldEditSource: (...args: unknown[]) => resolveGoldEditSourceMock(...args),
  commitGoldEdit: (...args: unknown[]) => commitGoldEditMock(...args),
}));

vi.mock('@/domain/replay', () => ({
  replay: (...args: unknown[]) => replayMock(...args),
}));

import { useGoldEdit } from '@/hooks/shared/useGoldEdit';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('useGoldEdit.applyEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
    useSettingsStore.setState({ localWorkspaceName: 'Local Workspace' });
    useWorkspaceStore.getState().setConversation('conv_123');
    useWorkspaceStore
      .getState()
      .setTurns([{ turn_hash: 'sha256:t1', role: 'user', content: 'hello' }]);
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
    resolveGoldEditSourceMock.mockResolvedValue(sourced);
    const preTree = {
      trees: [
        {
          key: 'trip',
          slots: { style: 'slow travel' },
          children: [{ key: 'budget', slots: { range: '$$' }, children: [] }],
        },
      ],
      relations: [],
    };
    useWorkspaceStore.getState().setDerived({
      tree: preTree,
      sourceIndex: new Map(),
      opsLog: [],
    });

    const { result } = renderHook(() => useGoldEdit());

    await act(async () => {
      await result.current.applyEdit({ unset: { path: 'trip/style' } });
    });

    expect(resolveGoldEditSourceMock).toHaveBeenCalledTimes(1);
    expect(resolveGoldEditSourceMock).toHaveBeenCalledWith(
      { unset: { path: 'trip/style' } },
      { localAuthor: 'Local Workspace' }
    );

    // The op passed to optimistic replay carries the *same source instance*
    // as the op passed to commitGoldEdit.
    const optimisticOps = replayMock.mock.calls[0][0];
    const persistedSourcedOp = commitGoldEditMock.mock.calls[0][1];
    expect(replayMock.mock.calls[0][2]).toBe(preTree);
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
    resolveGoldEditSourceMock.mockResolvedValue(sourced);
    const preTree = {
      trees: [{ key: 'sports', slots: { teams: 'Two teams' }, children: [] }],
      relations: [],
    };
    const preSourceIndex = new Map([
      [
        'sports/teams',
        { type: 'human' as const, author: 'existing', at: '2026-04-25T00:00:00.000Z' },
      ],
    ]);
    useWorkspaceStore.getState().setDerived({
      tree: preTree,
      sourceIndex: preSourceIndex,
      opsLog: [],
    });
    replayMock.mockReturnValueOnce({
      tree: { trees: [{ key: 'x', slots: { value: 1 }, children: [] }], relations: [] },
      sourceIndex: new Map([['x', sourced.source]]),
    });
    commitGoldEditMock.mockRejectedValue(new Error('persist fail'));

    const { result } = renderHook(() => useGoldEdit());

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.applyEdit({ set: { path: 'x', value: 1 } });
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('persist fail');
    // The optimistic append is rolled back to the exact pre-edit derived state.
    expect(useWorkspaceStore.getState().lastError).toEqual('persist fail');
    expect(useWorkspaceStore.getState().tree).toBe(preTree);
    expect(useWorkspaceStore.getState().sourceIndex).toBe(preSourceIndex);
    expect(useWorkspaceStore.getState().opsLog).toEqual([]);
  });

  it('is a no-op when no conversation is active', async () => {
    useWorkspaceStore.getState().setConversation(null);
    const { result } = renderHook(() => useGoldEdit());

    await act(async () => {
      await result.current.applyEdit({ unset: { path: 'x' } });
    });

    expect(resolveGoldEditSourceMock).not.toHaveBeenCalled();
    expect(replayMock).not.toHaveBeenCalled();
    expect(commitGoldEditMock).not.toHaveBeenCalled();
  });

  it('rejects edits after the conversation is committed', async () => {
    useWorkspaceStore.getState().setCommitted(true);
    const { result } = renderHook(() => useGoldEdit());

    expect(result.current.enabled).toBe(false);

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.applyEdit({ unset: { path: 'x' } });
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('Committed conversations are read-only.');
    expect(resolveGoldEditSourceMock).not.toHaveBeenCalled();
    expect(replayMock).not.toHaveBeenCalled();
    expect(commitGoldEditMock).not.toHaveBeenCalled();
  });
});
