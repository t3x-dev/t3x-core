import type { PipelineEvent } from '@t3x-dev/core';
import { collectResult, runOperation } from '@t3x-dev/core';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPipelineContext } from '../../ops/context';
import { yopsApplyOp } from '../../ops/yops-apply';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRecord = {
  id: 'yops_001',
  conversationId: 'conv_abc',
  projectId: 'proj_123',
  source: 'pipeline',
  turnHash: 'sha256:turn1',
  yops: [
    { op: 'add_sentence', path: '/topics/0/sentences/-', value: { id: 's_1', text: 'hello' } },
  ],
  createdAt: new Date('2026-04-03T00:00:00Z'),
};

vi.mock('@t3x-dev/storage', () => ({
  insertYOpsLogEntry: vi.fn(() => Promise.resolve(mockRecord)),
}));

vi.mock('../../lib/tree-state-sync', () => ({
  syncYOpsToTrees: vi.fn(() => Promise.resolve()),
}));

function buildMockContext(overrides: Partial<ApiPipelineContext> = {}): ApiPipelineContext {
  const txProxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'transaction') {
          return async (fn: (tx: any) => Promise<any>) => fn(txProxy);
        }
        return vi.fn();
      },
    }
  );

  return {
    db: txProxy,
    projectId: 'proj_123',
    userId: 'user_1',
    providerRegistry: {},
    abortSignal: new AbortController().signal,
    ...overrides,
  } as ApiPipelineContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('yopsApplyOp', () => {
  it('has the correct name', () => {
    expect(yopsApplyOp.name).toBe('yops-apply');
  });

  it('yields step_start/step_done for persist and returns formatted output', async () => {
    const ctx = buildMockContext();
    const events: PipelineEvent[] = [];

    const gen = runOperation(
      yopsApplyOp,
      {
        conversationId: 'conv_abc',
        source: 'pipeline',
        turnHash: 'sha256:turn1',
        yops: mockRecord.yops,
      },
      ctx
    );

    let result: IteratorResult<PipelineEvent, any>;
    do {
      result = await gen.next();
      if (!result.done) {
        events.push(result.value);
      }
    } while (!result.done);

    const output = result.value;

    // Verify pipeline events (op_start, step_start persist, step_done persist, op_done)
    const eventTypes = events.map((e) => `${e.type}${e.step ? `:${e.step}` : ''}`);
    expect(eventTypes).toContain('op_start');
    expect(eventTypes).toContain('step_start:persist');
    expect(eventTypes).toContain('step_done:persist');
    expect(eventTypes).toContain('op_done');

    // Verify output shape (snake_case API format)
    expect(output).toEqual({
      id: 'yops_001',
      conversation_id: 'conv_abc',
      project_id: 'proj_123',
      source: 'pipeline',
      turn_hash: 'sha256:turn1',
      yops: mockRecord.yops,
      created_at: '2026-04-03T00:00:00.000Z',
    });
  });

  it('returns null for turn_hash when turnHash is undefined', async () => {
    const ctx = buildMockContext();

    // Override mock to return record with null turnHash
    const { insertYOpsLogEntry } = await import('@t3x-dev/storage');
    (insertYOpsLogEntry as any).mockResolvedValueOnce({
      ...mockRecord,
      turnHash: null,
    });

    const output = await collectResult(
      runOperation(
        yopsApplyOp,
        {
          conversationId: 'conv_abc',
          source: 'manual',
          yops: [],
        },
        ctx
      )
    );

    expect(output.turn_hash).toBeNull();
  });

  it('calls insertYOpsLogEntry and syncYOpsToTrees with correct args', async () => {
    const ctx = buildMockContext();
    const { insertYOpsLogEntry } = await import('@t3x-dev/storage');
    const { syncYOpsToTrees } = await import('../../lib/tree-state-sync');

    (insertYOpsLogEntry as any).mockClear();
    (syncYOpsToTrees as any).mockClear();

    await collectResult(
      runOperation(
        yopsApplyOp,
        {
          conversationId: 'conv_abc',
          source: 'pipeline',
          turnHash: 'sha256:turn1',
          yops: [{ op: 'test' }],
        },
        ctx
      )
    );

    expect(insertYOpsLogEntry).toHaveBeenCalledWith(
      expect.anything(), // tx
      {
        conversationId: 'conv_abc',
        projectId: 'proj_123',
        source: 'pipeline',
        turnHash: 'sha256:turn1',
        yops: [{ op: 'test' }],
      }
    );

    expect(syncYOpsToTrees).toHaveBeenCalledWith(
      expect.anything(), // tx
      'conv_abc',
      'proj_123'
    );
  });
});
