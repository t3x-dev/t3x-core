export const EXTRACTION_FAILURE_CODES = [
  'transport',
  'draft_parse',
  'draft_schema',
  'provenance',
  'compile',
  'executable_structure',
  'domain_schema',
  // Source-quote validation failure: the LLM emitted evidence quotes
  // that are not exact substrings of the provided turn content (after
  // deterministic repair: smart-quote variants, markdown strip,
  // case-insensitive whitespace-collapsed match). Reaskable with
  // targeted feedback naming the failing item ids and turn tags.
  'unverifiable_quote',
] as const;

export type ExtractionFailureCode = (typeof EXTRACTION_FAILURE_CODES)[number];
export type RetryStrategy =
  | 'none'
  | 'immediate'
  | 'backoff'
  | 'targeted_reask'
  | 'provider_fallback';

export interface RetryDecision {
  retryable: boolean;
  strategy: RetryStrategy;
  maxAttempts: number;
}

export interface ExtractionFailure {
  code: ExtractionFailureCode;
  message: string;
  retry: RetryDecision;
  provider?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

const RETRY_STRATEGIES: Record<ExtractionFailureCode, RetryDecision> = {
  transport: { retryable: true, strategy: 'backoff', maxAttempts: 3 },
  draft_parse: { retryable: true, strategy: 'targeted_reask', maxAttempts: 2 },
  draft_schema: { retryable: true, strategy: 'targeted_reask', maxAttempts: 2 },
  provenance: { retryable: true, strategy: 'targeted_reask', maxAttempts: 2 },
  compile: { retryable: false, strategy: 'none', maxAttempts: 0 },
  executable_structure: { retryable: false, strategy: 'none', maxAttempts: 0 },
  domain_schema: { retryable: false, strategy: 'none', maxAttempts: 0 },
  unverifiable_quote: { retryable: true, strategy: 'targeted_reask', maxAttempts: 2 },
};

export function getRetryStrategy(code: ExtractionFailureCode): RetryDecision {
  return RETRY_STRATEGIES[code];
}

export function isRetryableFailure(code: ExtractionFailureCode): boolean {
  return RETRY_STRATEGIES[code].retryable;
}

export function createExtractionFailure(
  code: ExtractionFailureCode,
  message: string,
  options?: Pick<ExtractionFailure, 'provider' | 'details' | 'cause'>
): ExtractionFailure {
  return {
    code,
    message,
    retry: getRetryStrategy(code),
    provider: options?.provider,
    details: options?.details,
    cause: options?.cause,
  };
}
