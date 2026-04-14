import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchConversationSnapshot, replayAppended } from '../loadConversation';
import * as loader from '@/infrastructure/conversationLoader';
import type { SourcedYOp } from '@t3x-dev/core';

beforeEach(() => {
  vi.restoreAllMocks();
});

const humanOp: SourcedYOp = {
  define: { path: 'trip' },
  source: { type: 'human', author: 'e', at: '2026-04-12T00:00:00Z' },
};

describe('fetchConversationSnapshot', () => {
  it('returns turns + opsLog + replayed tree + sourceIndex', async () => {
    vi.spyOn(loader, 'loadConversation').mockResolvedValue({
      convId: 'c1',
      turns: [
        {
          turn_hash: 'sha256:t1',
          content: 'hi',
          role: 'user',
          created_at: '2026-04-12T00:00:00Z',
        } as never,
      ],
      opsLog: [
        {
          id: 'yl_1',
          yops: [humanOp] as never,
          source: 'manual',
          created_at: '2026-04-12T00:00:00Z',
        } as never,
      ],
    });

    const snapshot = await fetchConversationSnapshot('p1', 'c1');

    expect(snapshot.turns).toHaveLength(1);
    expect(snapshot.turns[0].turn_hash).toBe('sha256:t1');
    expect(snapshot.opsLog).toHaveLength(1);
    expect(snapshot.tree.trees.length).toBeGreaterThan(0);
    expect(snapshot.sourceIndex).toBeInstanceOf(Map);
  });

  it('propagates loader errors', async () => {
    vi.spyOn(loader, 'loadConversation').mockRejectedValue(new Error('load fail'));
    await expect(fetchConversationSnapshot('p1', 'c1')).rejects.toThrow('load fail');
  });

  it('returns an empty snapshot when the conversation has no data', async () => {
    vi.spyOn(loader, 'loadConversation').mockResolvedValue({
      convId: 'c1',
      turns: [],
      opsLog: [],
    });
    const snapshot = await fetchConversationSnapshot('p1', 'c1');
    expect(snapshot.turns).toEqual([]);
    expect(snapshot.opsLog).toEqual([]);
  });
});

describe('replayAppended', () => {
  it('appends new ops, replays, and returns the next slice', () => {
    const firstOp: SourcedYOp = {
      define: { path: 'trip' },
      source: { type: 'human', author: 'a', at: '2026-04-12T00:00:00Z' },
    };
    const prevOps = [firstOp];
    const turns = [{ turn_hash: 'sha256:t1', content: 'x' }];
    const secondOp: SourcedYOp = {
      set: { path: 'trip/k', value: 'v' },
      source: { type: 'human', author: 'b', at: '2026-04-12T00:00:01Z' },
    };

    const result = replayAppended(prevOps, turns, [secondOp]);

    expect(result).not.toBeNull();
    expect(result!.opsLog).toHaveLength(2);
    expect(result!.sourceIndex.has('trip/k')).toBe(true);
  });

  it('returns null for an empty new-ops list', () => {
    expect(replayAppended([], [], [])).toBeNull();
  });
});
