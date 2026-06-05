// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

const postReviseYopsMock = vi.fn();

vi.mock('@/infrastructure/llm', () => ({
  postReviseYops: (...args: unknown[]) => postReviseYopsMock(...args),
}));

import { requestYOpsRevision } from '@/commands/yops/reviseAdapter';

describe('requestYOpsRevision', () => {
  it('posts feedback, current YOps, content, turns, provider, and model', async () => {
    postReviseYopsMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          kind: 'ok',
          ops: [{ set: { path: 'trip/destination', value: 'Tokyo' } }],
          reason: 'Updated destination.',
          dry_run: {
            ok: true,
            applied: 1,
            preview: {
              trees: [{ key: 'trip', slots: { destination: 'Tokyo' }, children: [] }],
              relations: [],
            },
          },
        },
      }),
      text: async () => '',
    });

    const input = {
      conversationId: 'conv_1',
      feedback: 'Use Tokyo.',
      yops: [{ set: { path: 'trip/destination', value: 'Hangzhou' } }],
      trees: [{ key: 'trip', slots: { destination: 'Hangzhou' }, children: [] }],
      relations: [],
      turns: [{ turn_hash: 'sha256:t1', role: 'user' as const, content: 'Use Tokyo.' }],
      provider: 'openai',
      model: 'gpt-5.4',
    };

    const result = await requestYOpsRevision(input);

    expect(postReviseYopsMock).toHaveBeenCalledWith('conv_1', {
      feedback: 'Use Tokyo.',
      yops: input.yops,
      trees: input.trees,
      relations: input.relations,
      turns: input.turns,
      provider: 'openai',
      model: 'gpt-5.4',
    });
    expect(result).toEqual({
      kind: 'ok',
      ops: [{ set: { path: 'trip/destination', value: 'Tokyo' } }],
      reason: 'Updated destination.',
      dry_run: {
        ok: true,
        applied: 1,
        preview: {
          trees: [{ key: 'trip', slots: { destination: 'Tokyo' }, children: [] }],
          relations: [],
        },
      },
    });
  });

  it('returns validation failure outcomes without throwing', async () => {
    postReviseYopsMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          kind: 'validation_failed',
          ops: [{ relate: { from: 'missing', to: 'trip', type: 'supports' } }],
          reason: 'Tried to relate a missing node.',
          dry_run: {
            ok: false,
            applied: 0,
            error: { op_index: 0, code: 'RELATE_NOT_FOUND', message: 'missing' },
          },
        },
      }),
      text: async () => '',
    });

    await expect(
      requestYOpsRevision({
        conversationId: 'conv_1',
        feedback: 'Add relation.',
        yops: [{ define: { path: 'trip' } }],
        trees: [{ key: 'trip', slots: {}, children: [] }],
        relations: [],
        turns: [],
      })
    ).resolves.toMatchObject({
      kind: 'validation_failed',
      dry_run: {
        ok: false,
        error: { code: 'RELATE_NOT_FOUND' },
      },
    });
  });

  it('throws an actionable error for API error envelopes', async () => {
    postReviseYopsMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error: { code: 'PROVIDER_KEY_MISSING', message: 'No configured provider' },
      }),
      text: async () => '',
    });

    await expect(
      requestYOpsRevision({
        conversationId: 'conv_1',
        feedback: 'Use Tokyo.',
        yops: [{ define: { path: 'trip' } }],
        trees: [],
        relations: [],
        turns: [],
      })
    ).rejects.toThrow('No configured provider');
  });
});
