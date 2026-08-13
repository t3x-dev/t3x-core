import {
  type ExtractAndApplyInput,
  type ExtractAndApplyResult,
  extractAndApply,
} from './extract-and-apply';
import type { ExtractionFailure } from './failures';
import { getRetryStrategy } from './failures';

export interface ExtractionTransportRetryOptions {
  /** Total attempts, including the first call. */
  maxAttempts?: number;
  /** Base exponential backoff delay. */
  baseDelayMs?: number;
  /** Test hook; defaults to setTimeout. */
  sleep?: (delayMs: number) => Promise<void>;
}

export interface ExtractAndApplyWithRetryInput extends ExtractAndApplyInput {
  transportRetry?: ExtractionTransportRetryOptions;
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function numberDetail(failure: ExtractionFailure, key: string): number | undefined {
  const value = failure.details?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringDetail(failure: ExtractionFailure, key: string): string | undefined {
  const value = failure.details?.[key];
  return typeof value === 'string' ? value : undefined;
}

function isRetryableTransport(failure: ExtractionFailure): boolean {
  if (failure.code !== 'transport' || !failure.retry.retryable) return false;
  const status = numberDetail(failure, 'statusCode');
  const providerCode = stringDetail(failure, 'providerCode');
  if (providerCode === 'AUTH_ERROR' || status === 401 || status === 403) return false;
  return status === undefined || status === 429 || status >= 500;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.floor(value))
    : fallback;
}

export async function extractAndApplyWithRetry(
  input: ExtractAndApplyWithRetryInput
): Promise<ExtractAndApplyResult> {
  const { transportRetry, ...strictInput } = input;
  const maxAttempts = positiveInteger(
    transportRetry?.maxAttempts,
    getRetryStrategy('transport').maxAttempts
  );
  const baseDelayMs = Math.max(0, transportRetry?.baseDelayMs ?? 250);
  const sleep = transportRetry?.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await extractAndApply(strictInput);
    if (result.ok || !isRetryableTransport(result.failure) || attempt === maxAttempts) {
      if (!result.ok && attempt > 1) {
        result.failure.details = { ...result.failure.details, attempts: attempt };
      }
      return result;
    }
    await sleep(baseDelayMs * 2 ** (attempt - 1));
  }

  throw new Error('unreachable extraction retry state');
}
