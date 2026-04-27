// @vitest-environment jsdom

import type { SourcedYOp, ValidationTurn } from '@t3x-dev/core';
import { createExtractionFailure } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtractionFailedError, ExtractionRequestError } from '@/commands/yops/errors';

const commitOpsMock = vi.fn();
const validateExecutableStructureMock = vi.fn();

vi.mock('@/commands/yops/yopsService', () => ({
  commitOps: (...args: unknown[]) => commitOpsMock(...args),
}));

vi.mock('@/commands/yops/structureValidator', () => ({
  validateExecutableStructure: (...args: unknown[]) => validateExecutableStructureMock(...args),
}));

import { runExtraction } from '@/commands/yops/extractionWorker';

describe('runExtraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    validateExecutableStructureMock.mockReturnValue({ ok: true });
    commitOpsMock.mockResolvedValue(undefined);

    await runExtraction({
      baseTree: { trees: [], relations: [] },
      conversationId: 'conv_123',
      turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'hello' }],
      llm,
    });

    expect(llm).toHaveBeenCalledTimes(3);
    expect(commitOpsMock).toHaveBeenCalledWith('conv_123', []);
  });

  it('fails fast on non-retryable request failures', async () => {
    // Compile failures from the API map to web reason 'invalid_structure'
    // (not generic 'llm_error') so useExtraction renders the dedicated
    // 'do not form a valid tree update' message. failureCode still
    // carries the typed wire code for diagnostics.
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
      reason: 'invalid_structure',
      lastAttempt: 1,
      failureCode: 'compile',
      message: 'Compiler rejected the draft',
    });

    expect(llm).toHaveBeenCalledTimes(1);
    expect(commitOpsMock).not.toHaveBeenCalled();
  });

  it('does NOT retry on unverifiable_quote — server already exhausted internal reasks', async () => {
    // Review P2: callExtractionLLM no longer forwards failingOps
    // because the API now owns targeted reask. So when the API
    // returns a typed unverifiable_quote failure, its internal
    // budget is already spent. The web worker MUST NOT call
    // /extract-yops again with the same inputs — that's wasted
    // model spend for a guaranteed-identical failure.
    //
    // RetryStrategy for unverifiable_quote is { retryable: true,
    // maxAttempts: 2 } from the core taxonomy (it IS retryable
    // server-side), but on the wire it must be treated as terminal.
    const llm = vi.fn().mockRejectedValue(
      new ExtractionRequestError(
        createExtractionFailure('unverifiable_quote', '2 quotes did not verify', {
          details: {
            failingOps: [
              { opIndex: 1, path: 'a', turnTag: 'T1', badQuote: 'fake1' },
              { opIndex: 2, path: 'b', turnTag: 'T1', badQuote: 'fake2' },
            ],
          },
        }),
        400,
        'EXTRACTION_FAILED'
      )
    );

    let thrown: ExtractionFailedError | undefined;
    try {
      await runExtraction({
        baseTree: { trees: [], relations: [] },
        conversationId: 'conv_123',
        turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'hello' }],
        llm,
      });
    } catch (e) {
      thrown = e as ExtractionFailedError;
    }

    // Exactly one call. No retry, no doubled latency, no doubled
    // model spend.
    expect(llm).toHaveBeenCalledTimes(1);
    // Reason is the typed 'unverifiable_quote' (not generic 'llm_error')
    // so useExtraction renders the dedicated 'could not verify N slot(s)'
    // UI message instead of the fallback 'Extraction failed
    // (unverifiable_quote): ...'.
    expect(thrown?.reason).toBe('unverifiable_quote');
    expect(thrown?.failureCode).toBe('unverifiable_quote');
    // failingOps length matches the API-side count, so the UI message's
    // "N slot(s)" reflects what the server actually saw.
    expect(thrown?.failingOps).toHaveLength(2);
    expect(thrown?.failingOps?.[0]?.reason).toBe('unverifiable_quote');
  });

  it('still retries transport failures (genuinely client-retryable)', async () => {
    // Defensive inverse: the only retry path that survives the
    // 'server owns targeted reask' contract is genuine network /
    // rate-limit transport. Make sure that path still works after
    // the gate change — otherwise we'd kill all client retries by
    // accident.
    const llm = vi
      .fn()
      .mockRejectedValueOnce(
        new ExtractionRequestError(
          createExtractionFailure('transport', 'Rate limited'),
          429,
          'RATE_LIMITED'
        )
      )
      .mockResolvedValueOnce([]);

    validateExecutableStructureMock.mockReturnValue({ ok: true });
    commitOpsMock.mockResolvedValue(undefined);

    await runExtraction({
      baseTree: { trees: [], relations: [] },
      conversationId: 'conv_123',
      turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'hello' }],
      llm,
    });

    // First call rate-limited, second succeeded — retry path kept
    // for transport.
    expect(llm).toHaveBeenCalledTimes(2);
  });

  describe('commit flag', () => {
    // Shared fixtures for the commit-flag suite. Structure validation is
    // mocked at the module level (see top of file); each case drives it
    // with mockReturnValue/mockReturnValueOnce to steer the worker through
    // the success / retry / repair branches. The fixtures here are real
    // op shapes only because the worker still touches their `source` field
    // for normalization and source validation, which are not mocked.
    const realTurns: ValidationTurn[] = [
      { turn_hash: 'sha256:t1', content: 'The budget is ten thousand dollars.' },
    ];
    const validOps: SourcedYOp[] = [
      {
        set: { path: 'trip/budget', value: 'ten thousand dollars' },
        source: {
          type: 'llm',
          model: 'claude-sonnet-4-6',
          at: '2026-04-12T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'ten thousand dollars' },
        },
      },
    ];
    const invalidOps: SourcedYOp[] = [
      {
        set: { path: 'trip/budget', value: 'wrong' },
        source: {
          type: 'llm',
          model: 'claude-sonnet-4-6',
          at: '2026-04-12T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'not in turn' },
        },
      },
    ];

    it('default-true keeps today behavior: returns ops + calls commitOps', async () => {
      validateExecutableStructureMock.mockReturnValue({ ok: true });
      const llm = vi.fn().mockResolvedValueOnce(validOps);

      const result = await runExtraction({
        baseTree: { trees: [], relations: [] },
        conversationId: 'c1',
        turns: realTurns,
        llm,
      });

      expect(commitOpsMock).toHaveBeenCalledWith('c1', validOps);
      expect(result).toEqual({ ops: validOps, committed: true });
    });

    it('commit:false returns ops without writing to yops_log', async () => {
      // Propose-only path that an Apply-as-explicit-step caller would use.
      // Worker still validates + (where applicable) repairs; only the final
      // write is gated.
      validateExecutableStructureMock.mockReturnValue({ ok: true });
      const llm = vi.fn().mockResolvedValueOnce(validOps);

      const result = await runExtraction({
        baseTree: { trees: [], relations: [] },
        conversationId: 'c1',
        turns: realTurns,
        llm,
        commit: false,
      });

      expect(commitOpsMock).not.toHaveBeenCalled();
      expect(result).toEqual({ ops: validOps, committed: false });
    });

    it('commit:false still surfaces the repaired ops from a successful repair path', async () => {
      // A successful last-resort repair must surface the *repaired* ops
      // (not the original LLM ops) so a propose-only caller can preview
      // / apply the same sequence the auto-commit path would have.
      // First call: structure invalid (triggers retry); second/third: still
      // invalid (exhaust retries); then last-resort repair runs and the
      // injected define makes it pass.
      validateExecutableStructureMock.mockReturnValueOnce({
        ok: false,
        failingOps: [{ index: 0, reason: 'invalid_structure' as const, message: 'missing parent' }],
      });
      validateExecutableStructureMock.mockReturnValueOnce({
        ok: false,
        failingOps: [{ index: 0, reason: 'invalid_structure' as const, message: 'missing parent' }],
      });
      validateExecutableStructureMock.mockReturnValueOnce({
        ok: false,
        failingOps: [{ index: 0, reason: 'invalid_structure' as const, message: 'missing parent' }],
      });
      // After the last-resort repair injects a define, validation passes.
      validateExecutableStructureMock.mockReturnValueOnce({ ok: true });

      const autoRepairableOps: SourcedYOp[] = [
        {
          define: { path: 'trip' },
          source: {
            type: 'llm',
            model: 'gpt-4o-mini',
            at: '2026-04-17T00:00:00Z',
            turn_ref: { turn_hash: 'sha256:t1', quote: 'budget is ten thousand dollars' },
          },
        },
        {
          populate: { path: 'trip/day_1', values: { budget: 'ten thousand dollars' } },
          source: {
            type: 'llm',
            model: 'gpt-4o-mini',
            at: '2026-04-17T00:00:00Z',
            turn_ref: { turn_hash: 'sha256:t1', quote: 'ten thousand dollars' },
          },
        },
      ];
      const llm = vi.fn().mockResolvedValue(autoRepairableOps);
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await runExtraction({
        baseTree: { trees: [], relations: [] },
        conversationId: 'c1',
        turns: realTurns,
        llm,
        commit: false,
      });

      expect(commitOpsMock).not.toHaveBeenCalled();
      expect(result.committed).toBe(false);
      // Repair injects a define for `trip/day_1`, so the returned ops are
      // longer than the original LLM output.
      expect(result.ops.length).toBeGreaterThan(autoRepairableOps.length);
      expect(result.ops.some((op) => 'define' in op && op.define?.path === 'trip/day_1')).toBe(
        true
      );
    });

    it('commit:false still throws on validation failure (no silent swallow)', async () => {
      validateExecutableStructureMock.mockReturnValue({
        ok: false,
        failingOps: [
          { index: 0, reason: 'invalid_structure' as const, message: 'never going to validate' },
        ],
      });
      const llm = vi.fn().mockResolvedValue(invalidOps);
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(
        runExtraction({
          baseTree: { trees: [], relations: [] },
          conversationId: 'c1',
          turns: realTurns,
          llm,
          commit: false,
        })
      ).rejects.toBeInstanceOf(ExtractionFailedError);
      expect(commitOpsMock).not.toHaveBeenCalled();
    });
  });
});
