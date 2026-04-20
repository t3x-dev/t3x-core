// @vitest-environment jsdom

import { createExtractionFailure } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExtractionFailedError,
  ExtractionRequestError,
} from '@/commands/yops/errors';

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
        new ExtractionRequestError(createExtractionFailure('transport', 'Rate limited'), 429, 'RATE_LIMITED')
      )
      .mockRejectedValueOnce(
        new ExtractionRequestError(createExtractionFailure('transport', 'Rate limited'), 429, 'RATE_LIMITED')
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
    const llm = vi.fn().mockRejectedValueOnce(
      new ExtractionRequestError(createExtractionFailure('compile', 'Compiler rejected the draft'), 400, 'EXTRACTION_FAILED')
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
});
