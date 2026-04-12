import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourcedYOp, ValidationTurn } from '@t3x-dev/core';
import { runExtraction } from '../extractionWorker';
import { ExtractionFailedError } from '../errors';
import * as yopsService from '../yopsService';

beforeEach(() => { vi.restoreAllMocks(); });

const turns: ValidationTurn[] = [
  { turn_hash: 'sha256:t1', content: 'The budget is ten thousand dollars.' },
];

const validOps: SourcedYOp[] = [{
  set: { path: 'trip/budget', value: 'ten thousand dollars' },
  source: {
    type: 'llm',
    model: 'claude-sonnet-4-6',
    at: '2026-04-12T00:00:00Z',
    turn_ref: { turn_hash: 'sha256:t1', quote: 'ten thousand dollars' },
  },
}];

const invalidOps: SourcedYOp[] = [{
  set: { path: 'trip/budget', value: 'wrong' },
  source: {
    type: 'llm',
    model: 'claude-sonnet-4-6',
    at: '2026-04-12T00:00:00Z',
    turn_ref: { turn_hash: 'sha256:t1', quote: 'not in turn' },
  },
}];

describe('runExtraction', () => {
  it('succeeds on first try when LLM returns valid ops', async () => {
    const llm = vi.fn().mockResolvedValueOnce(validOps);
    const commit = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

    await runExtraction({ conversationId: 'c1', turns, llm });

    expect(llm).toHaveBeenCalledTimes(1);
    expect(llm).toHaveBeenCalledWith({ turns, failingOps: undefined });
    expect(commit).toHaveBeenCalledWith('c1', validOps);
  });

  it('retries once with failingOps and succeeds on attempt 2', async () => {
    const llm = vi.fn()
      .mockResolvedValueOnce(invalidOps)
      .mockResolvedValueOnce(validOps);
    vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

    await runExtraction({ conversationId: 'c1', turns, llm });

    expect(llm).toHaveBeenCalledTimes(2);
    expect(llm).toHaveBeenNthCalledWith(2, expect.objectContaining({
      turns,
      failingOps: expect.any(Array),
    }));
  });

  it('retries twice and succeeds on attempt 3', async () => {
    const llm = vi.fn()
      .mockResolvedValueOnce(invalidOps)
      .mockResolvedValueOnce(invalidOps)
      .mockResolvedValueOnce(validOps);
    vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

    await runExtraction({ conversationId: 'c1', turns, llm });

    expect(llm).toHaveBeenCalledTimes(3);
  });

  it('hard-fails after 2 retries (3 total calls) with ExtractionFailedError', async () => {
    const llm = vi.fn().mockResolvedValue(invalidOps);
    const commit = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

    let thrown: unknown;
    try {
      await runExtraction({ conversationId: 'c1', turns, llm });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ExtractionFailedError);
    expect((thrown as ExtractionFailedError).failingOps).toHaveLength(1);
    expect((thrown as ExtractionFailedError).reason).toBe('unverifiable_quote');
    expect(llm).toHaveBeenCalledTimes(3);
    expect(commit).not.toHaveBeenCalled();
  });

  it('wraps LLM errors in ExtractionFailedError with reason=llm_error', async () => {
    const llm = vi.fn().mockRejectedValue(new Error('network down'));

    let thrown: unknown;
    try {
      await runExtraction({ conversationId: 'c1', turns, llm });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ExtractionFailedError);
    expect((thrown as ExtractionFailedError).reason).toBe('llm_error');
    expect((thrown as ExtractionFailedError).message).toContain('network down');
  });

  it('does not call commitOps when validation fails before commit', async () => {
    const llm = vi.fn().mockResolvedValue(invalidOps);
    const commit = vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

    try { await runExtraction({ conversationId: 'c1', turns, llm }); } catch { /* expected */ }

    expect(commit).not.toHaveBeenCalled();
  });

  it('passes failing_ops verbatim on retry for surgical repair', async () => {
    const llm = vi.fn()
      .mockResolvedValueOnce(invalidOps)
      .mockResolvedValueOnce(validOps);
    vi.spyOn(yopsService, 'commitOps').mockResolvedValue({} as never);

    await runExtraction({ conversationId: 'c1', turns, llm });

    const secondCall = llm.mock.calls[1][0];
    expect(secondCall.failingOps).toBeDefined();
    expect(secondCall.failingOps[0].reason).toBe('unverifiable_quote');
  });
});
