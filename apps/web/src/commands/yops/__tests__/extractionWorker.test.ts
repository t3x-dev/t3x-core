import type { SemanticContent, SourcedYOp, ValidationTurn } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtractionFailedError } from '../errors';
import { runExtraction } from '../extractionWorker';
import * as yopsService from '../yopsService';

beforeEach(() => {
  vi.restoreAllMocks();
});

const turns: ValidationTurn[] = [
  { turn_hash: 'sha256:t1', content: 'The budget is ten thousand dollars.' },
];

const emptyTree: SemanticContent = { trees: [], relations: [] };

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

describe('runExtraction', () => {
  it('succeeds on first try when LLM returns valid ops', async () => {
    const llm = vi.fn().mockResolvedValueOnce(validOps);
    const commit = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

    await runExtraction({ baseTree: emptyTree, conversationId: 'c1', turns, llm });

    expect(llm).toHaveBeenCalledTimes(1);
    expect(llm).toHaveBeenCalledWith({ turns, failingOps: undefined });
    expect(commit).toHaveBeenCalledWith('c1', validOps);
  });

  it('retries once with failingOps and succeeds on attempt 2', async () => {
    const llm = vi.fn().mockResolvedValueOnce(invalidOps).mockResolvedValueOnce(validOps);
    vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

    await runExtraction({ baseTree: emptyTree, conversationId: 'c1', turns, llm });

    expect(llm).toHaveBeenCalledTimes(2);
    expect(llm).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        turns,
        failingOps: expect.any(Array),
      })
    );
  });

  it('retries twice and succeeds on attempt 3', async () => {
    const llm = vi
      .fn()
      .mockResolvedValueOnce(invalidOps)
      .mockResolvedValueOnce(invalidOps)
      .mockResolvedValueOnce(validOps);
    vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

    await runExtraction({ baseTree: emptyTree, conversationId: 'c1', turns, llm });

    expect(llm).toHaveBeenCalledTimes(3);
  });

  it('hard-fails after 2 retries (3 total calls) with ExtractionFailedError', async () => {
    const llm = vi.fn().mockResolvedValue(invalidOps);
    const commit = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

    let thrown: unknown;
    try {
      await runExtraction({ baseTree: emptyTree, conversationId: 'c1', turns, llm });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ExtractionFailedError);
    expect((thrown as ExtractionFailedError).failingOps).toHaveLength(1);
    expect((thrown as ExtractionFailedError).reason).toBe('unverifiable_quote');
    expect(llm).toHaveBeenCalledTimes(3);
    expect(commit).not.toHaveBeenCalled();
  });

  it('retries llm errors and then throws ExtractionFailedError with reason=llm_error', async () => {
    const llm = vi.fn().mockRejectedValue(new Error('network down'));

    let thrown: unknown;
    try {
      await runExtraction({ baseTree: emptyTree, conversationId: 'c1', turns, llm });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ExtractionFailedError);
    expect((thrown as ExtractionFailedError).reason).toBe('llm_error');
    expect((thrown as ExtractionFailedError).message).toContain('network down');
    expect(llm).toHaveBeenCalledTimes(3);
  });

  it('does not call commitOps when validation fails before commit', async () => {
    const llm = vi.fn().mockResolvedValue(invalidOps);
    const commit = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

    try {
      await runExtraction({ baseTree: emptyTree, conversationId: 'c1', turns, llm });
    } catch {
      /* expected */
    }

    expect(commit).not.toHaveBeenCalled();
  });

  it('passes failing_ops verbatim on retry for surgical repair', async () => {
    const llm = vi.fn().mockResolvedValueOnce(invalidOps).mockResolvedValueOnce(validOps);
    vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

    await runExtraction({ baseTree: emptyTree, conversationId: 'c1', turns, llm });

    const secondCall = llm.mock.calls[1][0];
    expect(secondCall.failingOps).toBeDefined();
    expect(secondCall.failingOps[0].reason).toBe('unverifiable_quote');
  });

  it('retries when ops have valid source but invalid structure', async () => {
    const structurallyInvalidOps: SourcedYOp[] = [
      {
        populate: { path: 'trip/itinerary/day_1', values: { budget: 'ten thousand dollars' } },
        source: {
          type: 'llm',
          model: 'gpt-4o-mini',
          at: '2026-04-17T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'ten thousand dollars' },
        },
      },
    ];
    const structurallyValidOps: SourcedYOp[] = [
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
        define: { path: 'trip/itinerary' },
        source: {
          type: 'llm',
          model: 'gpt-4o-mini',
          at: '2026-04-17T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'ten thousand dollars' },
        },
      },
      {
        define: { path: 'trip/itinerary/day_1' },
        source: {
          type: 'llm',
          model: 'gpt-4o-mini',
          at: '2026-04-17T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'budget is ten thousand dollars' },
        },
      },
      {
        populate: { path: 'trip/itinerary/day_1', values: { budget: 'ten thousand dollars' } },
        source: {
          type: 'llm',
          model: 'gpt-4o-mini',
          at: '2026-04-17T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'ten thousand dollars' },
        },
      },
    ];
    const llm = vi
      .fn()
      .mockResolvedValueOnce(structurallyInvalidOps)
      .mockResolvedValueOnce(structurallyValidOps);
    const commit = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

    await runExtraction({ baseTree: emptyTree, conversationId: 'c1', turns, llm });

    expect(llm).toHaveBeenCalledTimes(2);
    expect(llm.mock.calls[1][0].failingOps).toHaveLength(structurallyInvalidOps.length);
    expect(llm.mock.calls[1][0].failingOps[0].reason).toBe('invalid_structure');
    expect(commit).toHaveBeenCalledWith('c1', structurallyValidOps);
  });

  it('uses last-resort repair only after LLM retries are exhausted', async () => {
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
    const commit = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await runExtraction({ baseTree: emptyTree, conversationId: 'c1', turns, llm });

    expect(llm).toHaveBeenCalledTimes(3);
    expect(llm.mock.calls[1][0].failingOps[0].reason).toBe('invalid_structure');
    expect(llm.mock.calls[2][0].failingOps[0].reason).toBe('invalid_structure');
    expect(commit).toHaveBeenCalledWith('c1', [
      autoRepairableOps[0],
      { define: { path: 'trip/day_1' }, source: autoRepairableOps[1].source },
      autoRepairableOps[1],
    ]);
    expect(warn).toHaveBeenCalledWith(
      '[extraction] applied last-resort repair for missing define-before-populate',
      expect.objectContaining({
        conversationId: 'c1',
        attempt: 3,
        originalOps: 2,
        repairedOps: 3,
        insertedDefinePaths: ['trip/day_1'],
      })
    );
  });

  it('fails after retries if structure remains invalid and repair cannot help', async () => {
    const unrepairableOps: SourcedYOp[] = [
      {
        populate: { path: 'trip/day_1/stop_1', values: { budget: 'ten thousand dollars' } },
        source: {
          type: 'llm',
          model: 'gpt-4o-mini',
          at: '2026-04-17T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'ten thousand dollars' },
        },
      },
    ];
    const llm = vi.fn().mockResolvedValue(unrepairableOps);
    const commit = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let thrown: unknown;
    try {
      await runExtraction({ baseTree: emptyTree, conversationId: 'c1', turns, llm });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ExtractionFailedError);
    expect((thrown as ExtractionFailedError).reason).toBe('invalid_structure');
    expect(llm).toHaveBeenCalledTimes(3);
    expect(commit).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  describe('commit flag', () => {
    it('default-true keeps today behavior: returns ops + calls commitOps', async () => {
      const llm = vi.fn().mockResolvedValueOnce(validOps);
      const commit = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

      const result = await runExtraction({
        baseTree: emptyTree,
        conversationId: 'c1',
        turns,
        llm,
      });

      expect(commit).toHaveBeenCalledWith('c1', validOps);
      expect(result).toEqual({ ops: validOps, committed: true });
    });

    it('commit:false returns ops without writing to yops_log', async () => {
      // Propose-only path that the long-term Apply-as-explicit-step UX will
      // call. The worker still validates + repairs, but persistence is the
      // caller's decision. See docs/2026-04-26-extract-propose-vs-apply-rfc.md.
      const llm = vi.fn().mockResolvedValueOnce(validOps);
      const commit = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

      const result = await runExtraction({
        baseTree: emptyTree,
        conversationId: 'c1',
        turns,
        llm,
        commit: false,
      });

      expect(commit).not.toHaveBeenCalled();
      expect(result).toEqual({ ops: validOps, committed: false });
    });

    it('commit:false returns the repaired ops from the last-resort repair path', async () => {
      // Even with commit disabled, a successful last-resort repair should
      // surface the repaired ops (not the original LLM ops) so the caller
      // can preview / apply the fix.
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
      const commit = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await runExtraction({
        baseTree: emptyTree,
        conversationId: 'c1',
        turns,
        llm,
        commit: false,
      });

      expect(commit).not.toHaveBeenCalled();
      expect(result.committed).toBe(false);
      expect(result.ops).toHaveLength(3);
      // The injected define for `trip/day_1` is what makes the repair work;
      // it must appear in the returned ops so the caller can apply the
      // same sequence the auto-commit path would have.
      expect(result.ops[1]).toMatchObject({ define: { path: 'trip/day_1' } });
    });

    it('commit:false still throws on validation failure (no silent swallow)', async () => {
      const llm = vi.fn().mockResolvedValue(invalidOps);
      const commit = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

      await expect(
        runExtraction({
          baseTree: emptyTree,
          conversationId: 'c1',
          turns,
          llm,
          commit: false,
        })
      ).rejects.toBeInstanceOf(ExtractionFailedError);
      expect(commit).not.toHaveBeenCalled();
    });
  });

  it('logs failed last-resort repair attempts when inserts still do not validate', async () => {
    const partiallyRepairableButStillInvalidOps: SourcedYOp[] = [
      {
        define: { path: 'trip' },
        source: {
          type: 'llm',
          model: 'gpt-4o-mini',
          at: '2026-04-17T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'ten thousand dollars' },
        },
      },
      {
        define: { path: 'trip/day_1' },
        source: {
          type: 'llm',
          model: 'gpt-4o-mini',
          at: '2026-04-17T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'ten thousand dollars' },
        },
      },
      {
        populate: { path: 'trip/day_1/stop_1', values: { budget: 'ten thousand dollars' } },
        source: {
          type: 'llm',
          model: 'gpt-4o-mini',
          at: '2026-04-17T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'ten thousand dollars' },
        },
      },
      {
        populate: { path: 'trip/day_2/stop_1', values: { budget: 'ten thousand dollars' } },
        source: {
          type: 'llm',
          model: 'gpt-4o-mini',
          at: '2026-04-17T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'ten thousand dollars' },
        },
      },
    ];
    const llm = vi.fn().mockResolvedValue(partiallyRepairableButStillInvalidOps);
    const commit = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let thrown: unknown;
    try {
      await runExtraction({ baseTree: emptyTree, conversationId: 'c1', turns, llm });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ExtractionFailedError);
    expect((thrown as ExtractionFailedError).reason).toBe('invalid_structure');
    expect(commit).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[extraction] last-resort repair did not produce a valid structure',
      expect.objectContaining({
        conversationId: 'c1',
        attempt: 3,
        originalOps: 4,
        repairedOps: 5,
        insertedDefinePaths: ['trip/day_1/stop_1'],
      })
    );
  });
});
