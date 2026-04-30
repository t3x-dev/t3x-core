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

    const result = await callExtractionLLM({
      conversationId: 'c1',
      turns: [{ turn_hash: 'sha256:t1', content: 'hello' }],
      failingOps: undefined,
    });

    expect(result.ops).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.conversation_id).toBe('c1');
    expect(body.turns).toHaveLength(1);
  });

  it('sends the selected provider and model when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { ops: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await callExtractionLLM({
      conversationId: 'c1',
      turns: [{ turn_hash: 'sha256:t1', content: 'hello' }],
      provider: 'openai',
      model: 'gpt-4o-mini',
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.provider).toBe('openai');
    expect(body.model).toBe('gpt-4o-mini');
  });

  it('does not forward failingOps to the wire (server v2 owns retry)', async () => {
    // Regression: PR #870 dropped `failing_ops` from the request schema
    // because the v2 pipeline owns retry semantics server-side. The
    // worker still uses `failingOps` internally for client-side
    // classification, but the wire payload must not include the field.
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
    expect(body.failing_ops).toBeUndefined();
    expect(body.conversation_id).toBe('c1');
    expect(body.turns).toHaveLength(1);
  });

  it('forwards preset to the wire when provided', async () => {
    // Regression for the dead-UI symptom: the dropdown only worked end-to-end
    // when the preset travelled all the way to the API. Pin the wire field
    // name and value so a future rename in any layer is loud.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { ops: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await callExtractionLLM({
      conversationId: 'c1',
      turns: [{ turn_hash: 'sha256:t1', content: 'hello' }],
      preset: 'concise',
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.preset).toBe('concise');
  });

  it('returns variants from the success envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          ops: [{ define: { path: 'balanced_root' } }],
          variants: {
            concise: [{ define: { path: 'concise_root' } }],
            balanced: [{ define: { path: 'balanced_root' } }],
            detailed: [{ define: { path: 'detailed_root' } }],
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      callExtractionLLM({
        conversationId: 'c1',
        turns: [{ turn_hash: 'sha256:t1', content: 'hello' }],
        preset: 'balanced',
      })
    ).resolves.toEqual({
      ops: [{ define: { path: 'balanced_root' } }],
      variants: {
        concise: [{ define: { path: 'concise_root' } }],
        balanced: [{ define: { path: 'balanced_root' } }],
        detailed: [{ define: { path: 'detailed_root' } }],
      },
    });
  });

  it('omits preset from the wire when not provided', async () => {
    // Backward compat: programmatic callers (MCP, scripts, tests) that
    // don't care about presets must keep their existing payload shape.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { ops: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await callExtractionLLM({
      conversationId: 'c1',
      turns: [{ turn_hash: 'sha256:t1', content: 'hello' }],
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty('preset');
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
