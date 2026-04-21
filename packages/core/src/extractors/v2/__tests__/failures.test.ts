import { describe, expect, it } from 'vitest';
import { EXTRACTION_FAILURE_CODES, getRetryStrategy, isRetryableFailure } from '../failures';

describe('extractors/v2 failures', () => {
  it('exposes the canonical failure taxonomy', () => {
    expect(EXTRACTION_FAILURE_CODES).toEqual([
      'transport',
      'draft_parse',
      'draft_schema',
      'provenance',
      'compile',
      'executable_structure',
      'domain_schema',
    ]);
  });

  it('derives retryability from failure code rather than route logic', () => {
    expect(isRetryableFailure('transport')).toBe(true);
    expect(isRetryableFailure('draft_parse')).toBe(true);
    expect(isRetryableFailure('compile')).toBe(false);
    expect(isRetryableFailure('domain_schema')).toBe(false);
  });

  it('returns a deterministic retry strategy per failure code', () => {
    expect(getRetryStrategy('transport')).toEqual({
      retryable: true,
      strategy: 'backoff',
      maxAttempts: 3,
    });
    expect(getRetryStrategy('draft_schema')).toEqual({
      retryable: true,
      strategy: 'targeted_reask',
      maxAttempts: 2,
    });
    expect(getRetryStrategy('compile')).toEqual({
      retryable: false,
      strategy: 'none',
      maxAttempts: 0,
    });
  });
});
