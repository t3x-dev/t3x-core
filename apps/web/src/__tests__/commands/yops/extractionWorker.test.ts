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
