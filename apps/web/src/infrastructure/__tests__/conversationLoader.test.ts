import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as turnsClient from '@/infrastructure/turns';
import { loadConversation } from '../conversationLoader';
import * as yopsLog from '../yopsLog';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('loadConversation', () => {
  it('loads turns and yops in parallel', async () => {
    const turnsSpy = vi.spyOn(turnsClient, 'listTurns').mockResolvedValue({
      turns: [
        { turn_hash: 'sha256:a', content: 'hi', role: 'user', created_at: '2026-04-12T00:00:00Z' },
      ],
    } as never);
    const opsSpy = vi.spyOn(yopsLog, 'loadYOpsLog').mockResolvedValue([] as never);
    const result = await loadConversation('p1', 'c1');
    expect(turnsSpy).toHaveBeenCalledWith('p1', 'c1');
    expect(opsSpy).toHaveBeenCalledWith('c1');
    expect(result.convId).toBe('c1');
    expect(result.turns).toHaveLength(1);
    expect(result.opsLog).toEqual([]);
  });

  it('propagates error from turns loader', async () => {
    vi.spyOn(turnsClient, 'listTurns').mockRejectedValue(new Error('turns failed'));
    vi.spyOn(yopsLog, 'loadYOpsLog').mockResolvedValue([] as never);
    await expect(loadConversation('p1', 'c1')).rejects.toThrow('turns failed');
  });

  it('propagates error from yops loader', async () => {
    vi.spyOn(turnsClient, 'listTurns').mockResolvedValue({ turns: [] } as never);
    vi.spyOn(yopsLog, 'loadYOpsLog').mockRejectedValue(new Error('yops failed'));
    await expect(loadConversation('p1', 'c1')).rejects.toThrow('yops failed');
  });
});
