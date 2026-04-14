/**
 * L3 — typed errors surfaced to components for the YOps (SemanticContent)
 * aggregate. Per v2 §2.4, all aggregate errors inherit from CommandError.
 *
 * Consumers pattern-match via `instanceof` (specific subclass for
 * branch-on-failure UX, or `CommandError` for generic fallback).
 *
 * Source policy: YOps is the strictest aggregate. Every op MUST carry
 * a `LLMSource` or `HumanSource`; SourceValidationError is thrown at
 * the entry by `commands/yops/yopsService.commitOps`.
 *
 * Optimistic-update style: caller-rollback. Hooks (useGoldEdit) save
 * pre-opsLog, optimistically replay, and on any of these errors restore
 * the pre-state via `setDerived(replay(pre-opsLog))`.
 */

import type { FailingOp } from '@t3x-dev/core';
import { CommandError } from '../CommandError';

export class ExtractionFailedError extends CommandError {
  constructor(
    public failingOps: FailingOp[],
    public lastAttempt: number,
    public reason: 'missing_source' | 'unverifiable_quote' | 'exhausted_retries' | 'llm_error',
    message?: string
  ) {
    super('extraction_failed', message ?? `Extraction failed after ${lastAttempt} attempts`);
    this.name = 'ExtractionFailedError';
  }
}

export class SourceValidationError extends CommandError {
  constructor(
    public opIndex: number,
    public missingField: string,
    message?: string
  ) {
    super('source_validation', message ?? `op[${opIndex}] missing ${missingField}`);
    this.name = 'SourceValidationError';
  }
}

export class YOpsReplayError extends CommandError {
  constructor(
    public opIndex: number,
    public opError: string,
    message?: string
  ) {
    super('yops_replay', message ?? `replay failed at op ${opIndex}: ${opError}`);
    this.name = 'YOpsReplayError';
  }
}
