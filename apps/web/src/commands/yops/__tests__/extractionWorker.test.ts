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

  it('does not re-validate source quotes on the web side (server owns that contract)', async () => {
    // Architecture move (post-#N+1): runExtractionV2Pipeline runs
    // normalize/repair/validateSource server-side after compile and
    // returns a typed 'unverifiable_quote' failure when quotes don't
    // verify. The web worker no longer re-runs validateSource — what
    // the LLM callback returns is committed as-is.
    //
    // This test feeds the worker ops with a quote that's NOT a
    // substring of the turn content. The pre-architecture worker
    // would have rejected and retried via validateSource. Now: the
    // worker trusts the contract, calls commitOps, and returns.
    const llm = vi.fn().mockResolvedValueOnce(invalidOps);
    const commit = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

    await runExtraction({ baseTree: emptyTree, conversationId: 'c1', turns, llm });

    // No retry on the web side; commit happened on first response.
    expect(llm).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
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
