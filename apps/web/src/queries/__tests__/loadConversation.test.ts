import type { SourcedYOp } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { YOpsReplayError } from '@/commands/yops/errors';
import * as loader from '@/infrastructure/conversationLoader';
import { fetchConversationSnapshot, replayAppended } from '../loadConversation';

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

  it('throws replay error when persisted ops are structurally invalid', async () => {
    const invalidOp: SourcedYOp = {
      populate: { path: 'trip/day_1', values: { budget: '10k' } },
      source: { type: 'human', author: 'e', at: '2026-04-12T00:00:00Z' },
    };
    vi.spyOn(loader, 'loadConversation').mockResolvedValue({
      convId: 'c1',
      turns: [],
      opsLog: [
        {
          id: 'yl_bad',
          yops: [invalidOp] as never,
          source: 'manual',
          created_at: '2026-04-12T00:00:00Z',
        } as never,
      ],
    });

    await expect(fetchConversationSnapshot('p1', 'c1')).rejects.toThrow(YOpsReplayError);
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

  it('throws when appended ops are structurally invalid', () => {
    const firstOp: SourcedYOp = {
      define: { path: 'trip' },
      source: { type: 'human', author: 'a', at: '2026-04-12T00:00:00Z' },
    };
    const invalidOp: SourcedYOp = {
      populate: { path: 'trip/day_1', values: { budget: '10k' } },
      source: { type: 'human', author: 'b', at: '2026-04-12T00:00:01Z' },
    };

    expect(() =>
      replayAppended([firstOp], [{ turn_hash: 'sha256:t1', content: 'x' }], [invalidOp])
    ).toThrow(YOpsReplayError);
  });
});
