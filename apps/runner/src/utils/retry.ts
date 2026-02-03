/**
 * Retry Utility
 *
 * Exponential backoff retry for async operations.
 */

import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Operation name for logging */
  operationName?: string;
  /** Optional callback on retry */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

/**
 * Execute an async function with exponential backoff retry
 *
 * @param fn - Async function to execute
 * @param options - Retry options
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    operationName = 'operation',
    onRetry,
  } = options;

  let lastError: Error;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt > maxRetries) {
        logger.error(
          { operation: operationName, attempt, error: lastError.message },
          `${operationName} failed after ${maxRetries} retries`
        );
        throw lastError;
      }

      logger.warn(
        { operation: operationName, attempt, nextRetryMs: delayMs, error: lastError.message },
        `${operationName} failed, retrying...`
      );

      if (onRetry) {
        onRetry(attempt, lastError, delayMs);
      }

      // Wait before retry
      await sleep(delayMs);

      // Increase delay for next attempt (exponential backoff)
      delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError!;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a fetch request with exponential backoff
 *
 * @param url - URL to fetch
 * @param init - Fetch options
 * @param retryOptions - Retry options
 * @returns Fetch response
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retryOptions?: RetryOptions
): Promise<Response> {
  return retry(
    async () => {
      const response = await fetch(url, init);

      // Retry on server errors (5xx)
      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      return response;
    },
    {
      operationName: `fetch ${url}`,
      ...retryOptions,
    }
  );
}
