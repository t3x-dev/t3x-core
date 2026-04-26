// @vitest-environment jsdom

import { createExtractionFailure } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ExtractionFailedError, ExtractionRequestError } from '@/commands/yops/errors';

const commitOpsMock = vi.fn();
const validateExecutableStructureMock = vi.fn();
const validateSourceMock = vi.fn();
const applySourcedYOpsMock = vi.fn();

vi.mock('@/commands/yops/yopsService', () => ({
  commitOps: (...args: unknown[]) => commitOpsMock(...args),
}));

vi.mock('@/commands/yops/structureValidator', () => ({
  validateExecutableStructure: (...args: unknown[]) => validateExecutableStructureMock(...args),
}));

vi.mock('@t3x-dev/core', async () => {
  const actual = await vi.importActual<typeof import('@t3x-dev/core')>('@t3x-dev/core');
  return {
    ...actual,
    normalizeOpTurnHashes: vi.fn(),
    repairOpQuotes: vi.fn(),
    validateSource: (...args: unknown[]) => validateSourceMock(...args),
    applySourcedYOps: (...args: unknown[]) => applySourcedYOpsMock(...args),
  };
});

import { runExtraction } from '@/commands/yops/extractionWorker';

describe('runExtraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: source + structure both pass — individual tests override.
    validateSourceMock.mockReturnValue({ ok: true, failingOps: [] });
    validateExecutableStructureMock.mockReturnValue({ ok: true });
    // Default: salvage's per-op apply succeeds for any op — individual
    // tests override to simulate dangling SETs etc.
    applySourcedYOpsMock.mockImplementation(
      (content: { trees: unknown[]; relations: unknown[] }) => ({
        ok: true,
        trees: content.trees,
        relations: content.relations,
        applied: 1,
      })
    );
  });

  it('retries retryable request failures within the typed budget', async () => {
    const llm = vi
      .fn()
      .mockRejectedValueOnce(
        new ExtractionRequestError(
          createExtractionFailure('transport', 'Rate limited'),
          429,
          'RATE_LIMITED'
        )
      )
      .mockRejectedValueOnce(
        new ExtractionRequestError(
          createExtractionFailure('transport', 'Rate limited'),
          429,
          'RATE_LIMITED'
        )
      )
      .mockResolvedValueOnce([]);

    commitOpsMock.mockResolvedValue(undefined);

    const outcome = await runExtraction({
      baseTree: { trees: [], relations: [] },
      conversationId: 'conv_123',
      turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'hello' }],
      llm,
    });

    expect(llm).toHaveBeenCalledTimes(3);
    expect(commitOpsMock).toHaveBeenCalledWith('conv_123', []);
    expect(outcome).toEqual({ committed: 0 });
  });

  it('fails fast on non-retryable request failures', async () => {
    const llm = vi
      .fn()
      .mockRejectedValueOnce(
        new ExtractionRequestError(
          createExtractionFailure('compile', 'Compiler rejected the draft'),
          400,
          'EXTRACTION_FAILED'
        )
      );

    await expect(
      runExtraction({
        baseTree: { trees: [], relations: [] },
        conversationId: 'conv_123',
        turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'hello' }],
        llm,
      })
    ).rejects.toMatchObject<Partial<ExtractionFailedError>>({
      reason: 'llm_error',
      lastAttempt: 1,
      failureCode: 'compile',
      message: 'Compiler rejected the draft',
    });

    expect(llm).toHaveBeenCalledTimes(1);
    expect(commitOpsMock).not.toHaveBeenCalled();
  });

  it('degrades gracefully: commits the verified subset and returns partial when retries exhaust on unverifiable quotes', async () => {
    // Pretend the model emits four ops every retry, three of which fail
    // source verification (unverifiable quotes). Greedy-apply succeeds
    // for the verified op (op[0]) — we expect it to be committed instead
    // of the whole batch being thrown away.
    const ops = [
      { set: { path: 'a/x', value: 1 }, source: { type: 'human', author: 't' } },
      { set: { path: 'a/y', value: 2 }, source: { type: 'human', author: 't' } },
      { set: { path: 'a/z', value: 3 }, source: { type: 'human', author: 't' } },
      { set: { path: 'a/w', value: 4 }, source: { type: 'human', author: 't' } },
    ];
    const failingOps = [
      { op: ops[1], opIndex: 1, reason: 'unverifiable_quote' as const },
      { op: ops[2], opIndex: 2, reason: 'unverifiable_quote' as const },
      { op: ops[3], opIndex: 3, reason: 'unverifiable_quote' as const },
    ];
    validateSourceMock.mockReturnValue({ ok: false, failingOps });

    const llm = vi.fn().mockResolvedValue(ops);
    commitOpsMock.mockResolvedValue(undefined);

    const outcome = await runExtraction({
      baseTree: { trees: [], relations: [] },
      conversationId: 'conv_partial',
      turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'hello' }],
      llm,
    });

    // 1 initial call + MAX_RETRIES (2) = 3 attempts before degradation.
    expect(llm).toHaveBeenCalledTimes(3);
    // Only the verified subset (op[0]) gets committed.
    expect(commitOpsMock).toHaveBeenCalledTimes(1);
    expect(commitOpsMock.mock.calls[0][0]).toBe('conv_partial');
    expect(commitOpsMock.mock.calls[0][1]).toEqual([ops[0]]);
    expect(outcome.committed).toBe(1);
    expect(outcome.partial?.failingOps).toHaveLength(3);
    expect(outcome.partial?.reason).toBe('unverifiable_quote');
  });

  it('salvage drops dangling ops (e.g. a SET whose parent DEFINE was unverifiable) and commits the rest', async () => {
    // Three ops survive source verification: a DEFINE, a SET that depends
    // on a *different* (failing) DEFINE, and a SET that's fine. Greedy
    // apply should keep ops[0] and ops[2] and skip ops[1].
    const ops = [
      { define: { path: 'sony', value: {} }, source: { type: 'human', author: 't' } },
      { set: { path: 'canon/model', value: 'R5' }, source: { type: 'human', author: 't' } },
      {
        set: { path: 'sony/availability', value: 'unreleased' },
        source: { type: 'human', author: 't' },
      },
    ];
    validateSourceMock.mockReturnValue({
      ok: false,
      failingOps: [{ op: ops[0], opIndex: 99, reason: 'unverifiable_quote' as const }],
    });
    // Greedy apply: ops[0] ok, ops[1] fails (no parent canon), ops[2] ok.
    applySourcedYOpsMock.mockImplementation(
      (content: { trees: unknown[]; relations: unknown[] }, batch: unknown[]) => {
        const op = batch[0] as { set?: { path: string } };
        if (op.set?.path?.startsWith('canon/')) {
          return {
            ok: false,
            trees: content.trees,
            relations: content.relations,
            applied: 0,
            error: { code: 'PATH_NOT_FOUND', message: 'no parent canon', op_index: 0 },
          };
        }
        return {
          ok: true,
          trees: content.trees,
          relations: content.relations,
          applied: 1,
        };
      }
    );

    const llm = vi.fn().mockResolvedValue(ops);
    commitOpsMock.mockResolvedValue(undefined);

    const outcome = await runExtraction({
      baseTree: { trees: [], relations: [] },
      conversationId: 'conv_dangling',
      turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'hello' }],
      llm,
    });

    expect(commitOpsMock).toHaveBeenCalledTimes(1);
    expect(commitOpsMock.mock.calls[0][1]).toEqual([ops[0], ops[2]]);
    expect(outcome.committed).toBe(2);
    expect(outcome.partial).toBeDefined();
  });

  it('still throws when no op can be salvaged (every op fails source verification)', async () => {
    const ops = [
      { set: { path: 'a/x', value: 1 }, source: { type: 'human', author: 't' } },
      { set: { path: 'a/y', value: 2 }, source: { type: 'human', author: 't' } },
    ];
    const failingOps = [
      { op: ops[0], opIndex: 0, reason: 'unverifiable_quote' as const },
      { op: ops[1], opIndex: 1, reason: 'unverifiable_quote' as const },
    ];
    validateSourceMock.mockReturnValue({ ok: false, failingOps });

    const llm = vi.fn().mockResolvedValue(ops);

    await expect(
      runExtraction({
        baseTree: { trees: [], relations: [] },
        conversationId: 'conv_total_fail',
        turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'hello' }],
        llm,
      })
    ).rejects.toMatchObject<Partial<ExtractionFailedError>>({
      reason: 'unverifiable_quote',
    });
    expect(commitOpsMock).not.toHaveBeenCalled();
  });
});
