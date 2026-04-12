/**
 * L2 — typed errors surfaced to components.
 * Components pattern-match on instanceof for UX.
 */

import type { FailingOp } from '@t3x-dev/core';

export class ExtractionFailedError extends Error {
  constructor(
    public failingOps: FailingOp[],
    public lastAttempt: number,
    public reason: 'missing_source' | 'unverifiable_quote' | 'exhausted_retries' | 'llm_error',
    message?: string,
  ) {
    super(message ?? `Extraction failed after ${lastAttempt} attempts`);
    this.name = 'ExtractionFailedError';
  }
}

export class SourceValidationError extends Error {
  constructor(
    public opIndex: number,
    public missingField: string,
    message?: string,
  ) {
    super(message ?? `op[${opIndex}] missing ${missingField}`);
    this.name = 'SourceValidationError';
  }
}

export class YOpsReplayError extends Error {
  constructor(
    public opIndex: number,
    public opError: string,
    message?: string,
  ) {
    super(message ?? `replay failed at op ${opIndex}: ${opError}`);
    this.name = 'YOpsReplayError';
  }
}
