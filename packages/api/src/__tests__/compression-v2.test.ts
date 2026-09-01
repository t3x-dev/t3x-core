/** biome-ignore-all lint/suspicious/noExplicitAny: compact API composition fixtures */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runApiCompressionV2 } from '../lib/compression-v2';
import {
  createInferenceRuntime,
  InferenceAdmissionDeniedError,
  InferenceExecutionError,
} from '../lib/inference';

const mocks = vi.hoisted(() => ({
  findConversationById: vi.fn(),
  generate: vi.fn(),
  getConversationInheritedBaseline: vi.fn(),
  listActiveYOpsLogByConversation: vi.fn(),
  replayEntriesOnBaselineFailFast: vi.fn(),
  resolveProviderAndModel: vi.fn(),
  toYOpsLogEntries: vi.fn(),
}));

vi.mock('@t3x-dev/storage', () => ({
  findConversationById: mocks.findConversationById,
  listActiveYOpsLogByConversation: mocks.listActiveYOpsLogByConversation,
}));

vi.mock('../lib/provider-resolver', () => ({
  resolveProviderAndModel: mocks.resolveProviderAndModel,
}));

vi.mock('../lib/yops-log-utils', () => ({
  getConversationInheritedBaseline: mocks.getConversationInheritedBaseline,
  replayEntriesOnBaselineFailFast: mocks.replayEntriesOnBaselineFailFast,
  toYOpsLogEntries: mocks.toYOpsLogEntries,
}));

const snapshot = {
  trees: [
    { key: 'one', slots: { value: 'first' }, children: [] },
    { key: 'two', slots: { value: 'second' }, children: [] },
  ],
  relations: [],
};

function input(runtime: ReturnType<typeof createInferenceRuntime>) {
  return {
    db: {} as any,
    conversationId: 'conversation_1',
    inference: {
      runtime,
      runId: 'run:compression',
      scope: {
        actor: { kind: 'user' as const, id: 'user_1' },
        namespaceId: 'namespace_1',
        projectId: 'project_1',
        projectVisibility: 'private' as const,
      },
    },
  };
}

describe('runApiCompressionV2 inference lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findConversationById.mockResolvedValue({
      id: 'conversation_1',
      projectId: 'project_1',
    });
    mocks.listActiveYOpsLogByConversation.mockResolvedValue([]);
    mocks.getConversationInheritedBaseline.mockResolvedValue(snapshot);
    mocks.replayEntriesOnBaselineFailFast.mockReturnValue(snapshot);
    mocks.toYOpsLogEntries.mockReturnValue([]);
    mocks.generate.mockResolvedValue({
      text: JSON.stringify({
        changes: [{ action: 'remove', target: 'two' }],
        summary: 'Removed a duplicate',
        stats: { before: 2, after: 1, removed: 1 },
      }),
      usage: { inputTokens: 21, outputTokens: 9 },
    });
    mocks.resolveProviderAndModel.mockResolvedValue({
      ok: true,
      providerId: 'openai',
      model: 'gpt-test',
      provider: { id: 'openai', generate: mocks.generate },
      registry: {},
    });
  });

  it('settles compression with server-derived scope and provider usage', async () => {
    const settle = vi.fn(async () => {});
    const runtime = createInferenceRuntime({
      admissionPolicy: {
        authorize: async () => ({ outcome: 'admitted', admission: { id: 'reservation:1' } }),
        settle,
        release: vi.fn(async () => {}),
      },
      createGenerationId: () => 'generation:compression:1',
    });

    const result = await runApiCompressionV2(input(runtime));

    expect(result).toMatchObject({
      ok: true,
      model: 'gpt-test',
      projectId: 'project_1',
      usage: { inputTokens: 21, outputTokens: 9 },
    });
    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: expect.objectContaining({
          generationId: 'generation:compression:1',
          runId: 'run:compression',
          feature: 'extraction.compression',
          scope: expect.objectContaining({
            namespaceId: 'namespace_1',
            projectId: 'project_1',
          }),
        }),
        terminal: {
          kind: 'receipt',
          receipt: expect.objectContaining({
            resolvedProvider: 'openai',
            resolvedModel: 'gpt-test',
            usage: { inputTokens: 21, outputTokens: 9 },
          }),
        },
      })
    );
  });

  it('preserves typed admission and provider failures across the Core boundary', async () => {
    const denied = createInferenceRuntime({
      admissionPolicy: {
        authorize: async () => ({
          outcome: 'denied',
          code: 'quota_exhausted',
          reason: 'Quota exhausted',
        }),
        settle: vi.fn(async () => {}),
        release: vi.fn(async () => {}),
      },
    });

    await expect(runApiCompressionV2(input(denied))).rejects.toBeInstanceOf(
      InferenceAdmissionDeniedError
    );
    expect(mocks.generate).not.toHaveBeenCalled();

    mocks.generate.mockRejectedValueOnce(new Error('upstream disconnected'));
    await expect(runApiCompressionV2(input(createInferenceRuntime()))).rejects.toBeInstanceOf(
      InferenceExecutionError
    );
  });
});
