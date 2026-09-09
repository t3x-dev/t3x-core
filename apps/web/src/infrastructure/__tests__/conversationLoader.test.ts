import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as conversationsClient from '@/infrastructure/conversations';
import * as sourceEvidenceClient from '@/infrastructure/sourceEvidence';
import * as turnsClient from '@/infrastructure/turns';
import { loadConversation } from '../conversationLoader';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('loadConversation', () => {
  it('loads turns and active archived YOps evidence in parallel', async () => {
    const conversationSpy = vi.spyOn(conversationsClient, 'getConversation').mockResolvedValue({
      conversation_id: 'c1',
      project_id: 'p1',
      title: 'Loaded',
      created_at: '2026-04-12T00:00:00Z',
      committed_as: 'sha256:abc',
      committed_at: '2026-04-12T00:00:01Z',
    } as never);
    const turnsSpy = vi.spyOn(turnsClient, 'listTurns').mockResolvedValue({
      turns: [
        { turn_hash: 'sha256:a', content: 'hi', role: 'user', created_at: '2026-04-12T00:00:00Z' },
      ],
    } as never);
    const opsSpy = vi.spyOn(sourceEvidenceClient, 'getLegacyYOpsEvidence').mockResolvedValue({
      items: [],
      limit: 200,
      offset: 0,
    } as never);
    const result = await loadConversation('p1', 'c1');
    expect(conversationSpy).toHaveBeenCalledWith('c1');
    expect(turnsSpy).toHaveBeenCalledWith('p1', 'c1');
    expect(opsSpy).toHaveBeenCalledWith('p1', 'c1', { order: 'asc', limit: 200 });
    expect(result.convId).toBe('c1');
    expect(result.turns).toHaveLength(1);
    expect(result.opsLog).toEqual([]);
    expect(result.committedAs).toBe('sha256:abc');
    expect(result.committedAt).toBe('2026-04-12T00:00:01Z');
  });

  it('propagates error from turns loader', async () => {
    vi.spyOn(conversationsClient, 'getConversation').mockResolvedValue({
      conversation_id: 'c1',
      project_id: 'p1',
      created_at: '2026-04-12T00:00:00Z',
    } as never);
    vi.spyOn(turnsClient, 'listTurns').mockRejectedValue(new Error('turns failed'));
    vi.spyOn(sourceEvidenceClient, 'getLegacyYOpsEvidence').mockResolvedValue({
      items: [],
    } as never);
    await expect(loadConversation('p1', 'c1')).rejects.toThrow('turns failed');
  });

  it('propagates error from archived evidence loader', async () => {
    vi.spyOn(conversationsClient, 'getConversation').mockResolvedValue({
      conversation_id: 'c1',
      project_id: 'p1',
      created_at: '2026-04-12T00:00:00Z',
    } as never);
    vi.spyOn(turnsClient, 'listTurns').mockResolvedValue({ turns: [] } as never);
    vi.spyOn(sourceEvidenceClient, 'getLegacyYOpsEvidence').mockRejectedValue(
      new Error('evidence failed')
    );
    await expect(loadConversation('p1', 'c1')).rejects.toThrow('evidence failed');
  });
});
