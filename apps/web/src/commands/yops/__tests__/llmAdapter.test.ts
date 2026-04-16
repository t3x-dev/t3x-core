import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callExtractionLLM } from '../llmAdapter';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('callExtractionLLM', () => {
  it('POSTs to the extract endpoint with turns and failingOps', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          ops: [
            {
              set: { path: 'x', value: 'y' },
              source: { type: 'human', author: 'test', at: '2026-04-12T00:00:00Z' },
            },
          ],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ops = await callExtractionLLM({
      conversationId: 'c1',
      turns: [{ turn_hash: 'sha256:t1', content: 'hello' }],
      failingOps: undefined,
    });

    expect(ops).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.conversation_id).toBe('c1');
    expect(body.turns).toHaveLength(1);
  });

  it('sends failing_ops when retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { ops: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await callExtractionLLM({
      conversationId: 'c1',
      turns: [{ turn_hash: 'sha256:t1', content: 'hello' }],
      failingOps: [{ op: {}, opIndex: 0, reason: 'unverifiable_quote' } as never],
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.failing_ops).toHaveLength(1);
  });

  it('throws on non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'boom' }),
      })
    );
    await expect(
      callExtractionLLM({
        conversationId: 'c1',
        turns: [],
        failingOps: undefined,
      })
    ).rejects.toThrow(/500/);
  });
});
