import type { PipelineEvent } from '@t3x-dev/core';
import { collectResult, runOperation } from '@t3x-dev/core';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPipelineContext } from '../../ops/context';
import type { ExtractInput } from '../../ops/extract';
import { extractOp } from '../../ops/extract';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockRunApiExtractionV2 } = vi.hoisted(() => ({
  mockRunApiExtractionV2: vi.fn(),
}));

vi.mock('../../lib/extraction-v2', () => ({
  runApiExtractionV2: mockRunApiExtractionV2,
}));

function buildMockContext(overrides: Partial<ApiPipelineContext> = {}): ApiPipelineContext {
  return {
    db: {} as any,
    projectId: 'proj_123',
    userId: 'user_1',
    providerRegistry: {} as any,
    abortSignal: new AbortController().signal,
    ...overrides,
  } as ApiPipelineContext;
}

const baseInput: ExtractInput = {
  conversationId: 'conv_abc',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractOp', () => {
  it('returns the canonical v2 extraction result', async () => {
    mockRunApiExtractionV2.mockResolvedValueOnce({
      ok: true,
      mode: 'bootstrap',
      snapshot: { trees: [{ key: 'topics', slots: {}, children: [] }], relations: [] },
      ops: [{ define: { path: 'topics' }, source: { turn_hash: 'sha256:turn1', quote: 'hello' } }],
      lastTurnHash: 'sha256:turn1',
    });

    const output = await collectResult(runOperation(extractOp, baseInput, buildMockContext()));

    expect(output).toEqual({
      ok: true,
      mode: 'bootstrap',
      snapshot: { trees: [{ key: 'topics', slots: {}, children: [] }], relations: [] },
      ops: [{ define: { path: 'topics' }, source: { turn_hash: 'sha256:turn1', quote: 'hello' } }],
      lastTurnHash: 'sha256:turn1',
    });
  });

  it('has the correct name', () => {
    expect(extractOp.name).toBe('extract');
  });

  it('yields op_start, step_start/step_done extract, and op_done', async () => {
    mockRunApiExtractionV2.mockResolvedValueOnce({
      ok: true,
      mode: 'bootstrap',
      snapshot: { trees: [], relations: [] },
      ops: [],
      lastTurnHash: 'sha256:turn1',
    });

    const ctx = buildMockContext();
    const events: PipelineEvent[] = [];

    const gen = runOperation(extractOp, baseInput, ctx);

    let result: IteratorResult<PipelineEvent, any>;
    do {
      result = await gen.next();
      if (!result.done) {
        events.push(result.value);
      }
    } while (!result.done);

    const eventSummary = events.map((e) => `${e.type}${e.step ? `:${e.step}` : ''}`);

    // Envelope events from runOperation
    expect(eventSummary).toContain('op_start');
    expect(eventSummary).toContain('op_done');

    // Step wrapper events from extractOp
    expect(eventSummary).toContain('step_start:extract');
    expect(eventSummary).toContain('step_done:extract');

  });

  it('passes db, conversation scope, and user model parameters to runApiExtractionV2', async () => {
    const ctx = buildMockContext({ projectId: 'proj_999', userId: 'user_42' });
    mockRunApiExtractionV2.mockResolvedValueOnce({
      ok: true,
      mode: 'incremental',
      snapshot: { trees: [], relations: [] },
      ops: [],
      lastTurnHash: 'sha256:turn2',
    });

    const input: ExtractInput = {
      conversationId: 'conv_xyz',
      turnHashes: ['sha256:turn1', 'sha256:turn2'],
      provider: 'openai',
      model: 'gpt-5.4',
    };

    await collectResult(runOperation(extractOp, input, ctx));

    expect(mockRunApiExtractionV2).toHaveBeenCalledWith({
      db: ctx.db,
      conversationId: 'conv_xyz',
      turnHashes: ['sha256:turn1', 'sha256:turn2'],
      provider: 'openai',
      model: 'gpt-5.4',
    });
  });

  it('surfaces failure metadata on the extract step', async () => {
    mockRunApiExtractionV2.mockResolvedValueOnce({
      ok: false,
      kind: 'failure',
      message: 'Draft schema invalid',
      failure: {
        code: 'draft_schema',
        message: 'Draft schema invalid',
        retry: { retryable: true, strategy: 'retry_same_model', maxAttempts: 2 },
      },
    });

    const ctx = buildMockContext();
    const events: PipelineEvent[] = [];
    const gen = runOperation(extractOp, baseInput, ctx);

    let result: IteratorResult<PipelineEvent, unknown>;
    do {
      result = await gen.next();
      if (!result.done) {
        events.push(result.value);
      }
    } while (!result.done);

    const extractDone = events.find((event) => event.type === 'step_done' && event.step === 'extract');
    expect(extractDone?.data).toEqual({
      ok: false,
      kind: 'failure',
      failure_code: 'draft_schema',
    });
  });
});
