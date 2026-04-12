import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateConversation, appendOpsAndReplay } from '../loadConversation';
import { useWorkspaceStore } from '@/store/workspaceStore';
import * as loader from '@/infrastructure/conversationLoader';
import type { SourcedYOp } from '@t3x-dev/core';

beforeEach(() => {
  vi.restoreAllMocks();
  useWorkspaceStore.getState().reset();
});

const humanOp: SourcedYOp = {
  define: { path: 'trip' },
  source: { type: 'human', author: 'e', at: '2026-04-12T00:00:00Z' },
};

describe('hydrateConversation', () => {
  it('loads turns + ops and writes derived state to store', async () => {
    vi.spyOn(loader, 'loadConversation').mockResolvedValue({
      convId: 'c1',
      turns: [{ turn_hash: 'sha256:t1', content: 'hi', role: 'user', created_at: '2026-04-12T00:00:00Z' } as never],
      opsLog: [{ id: 'yl_1', yops: [humanOp] as never, source: 'manual', created_at: '2026-04-12T00:00:00Z' } as never],
    });

    await hydrateConversation('p1', 'c1');

    const state = useWorkspaceStore.getState();
    expect(state.conversationId).toBe('c1');
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0].turn_hash).toBe('sha256:t1');
    expect(state.opsLog).toHaveLength(1);
    expect(state.tree.trees.length).toBeGreaterThan(0); // replay produced something
  });

  it('clears previous error state', async () => {
    useWorkspaceStore.getState().setError('previous');
    vi.spyOn(loader, 'loadConversation').mockResolvedValue({
      convId: 'c1', turns: [], opsLog: [],
    });

    await hydrateConversation('p1', 'c1');

    expect(useWorkspaceStore.getState().lastError).toBeNull();
  });

  it('propagates loader errors', async () => {
    vi.spyOn(loader, 'loadConversation').mockRejectedValue(new Error('load fail'));
    await expect(hydrateConversation('p1', 'c1')).rejects.toThrow('load fail');
  });

  it('sets mode to "idle" after successful hydrate', async () => {
    useWorkspaceStore.getState().setMode('streaming');
    vi.spyOn(loader, 'loadConversation').mockResolvedValue({
      convId: 'c1', turns: [], opsLog: [],
    });
    await hydrateConversation('p1', 'c1');
    expect(useWorkspaceStore.getState().mode).toBe('idle');
  });
});

describe('appendOpsAndReplay', () => {
  it('appends new ops to existing opsLog and re-replays', async () => {
    // Seed with one existing op
    const firstOp: SourcedYOp = {
      define: { path: 'trip' },
      source: { type: 'human', author: 'a', at: '2026-04-12T00:00:00Z' },
    };
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [{ key: 'trip', slots: {}, children: [] }], relations: [] },
      sourceIndex: new Map([['trip', firstOp.source]]),
      opsLog: [firstOp],
    });
    useWorkspaceStore.getState().setTurns([
      { turn_hash: 'sha256:t1', content: 'x' },
    ]);

    const secondOp: SourcedYOp = {
      set: { path: 'trip/k', value: 'v' },
      source: { type: 'human', author: 'b', at: '2026-04-12T00:00:01Z' },
    };
    await appendOpsAndReplay([secondOp]);

    const state = useWorkspaceStore.getState();
    expect(state.opsLog).toHaveLength(2);
    expect(state.sourceIndex.has('trip/k')).toBe(true);
  });

  it('handles empty ops input as no-op', async () => {
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map(),
      opsLog: [],
    });
    await appendOpsAndReplay([]);
    expect(useWorkspaceStore.getState().opsLog).toHaveLength(0);
  });
});
