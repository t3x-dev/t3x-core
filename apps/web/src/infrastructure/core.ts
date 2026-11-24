/**
 * API client core infrastructure - shared utilities
 */

import { traceNavigationRequest } from '@/utils/navigationTiming';
import { invalidateSessionReads } from './session';
import type { ApiCommitAnchors, ApiResponse } from './types';

// Browser HTTP stays same-origin. The BFF owns the server-side API credential.
export const API_BASE = '';
export const API_V1 = '/api/v1';
export const DEFAULT_TIMEOUT = 10000;

// ============================================================================
// JSON Parsing Helpers
// ============================================================================

/**
 * Safely parse JSON string, returning fallback on error
 */
export function safeJsonParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to parse JSON:', json.slice(0, 100));
    }
    return fallback;
  }
}

/**
 * Parse CommitAnchors from JSON and pre-compute global positions for UI rendering.
 *
 * The API stores anchor positions relative to their node (start/end).
 * For UI rendering, we need global positions (relative to the full source text).
 * This function adds global_start/global_end (snake_case) to each anchor.
 * These are later converted to camelCase (globalStart/globalEnd) by parseApiConfirmedAnchor.
 *
 * Graceful degradation: Returns null if data is corrupt (logs warning).
 * This prevents a single corrupt commit from breaking the entire canvas.
 */
export function _parseAnchorsWithGlobalPositions(json: string | null): ApiCommitAnchors | null {
  if (!json) return null;

  try {
    const anchors = JSON.parse(json) as ApiCommitAnchors;
    if (!anchors?.nodes) return anchors;

    // Pre-compute global positions for each anchor
    for (let i = 0; i < anchors.nodes.length; i++) {
      const node = anchors.nodes[i];

      // Graceful degradation: if start_char is missing, warn and return null
      // This prevents a single corrupt commit from breaking the entire canvas
      if (typeof node.start_char !== 'number') {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[api] Anchor data corrupt: node[${i}].start_char is missing (got ${typeof node.start_char}). ` +
              `Cannot compute global anchor positions. Anchor highlighting disabled for this commit.`
          );
        }
        return null;
      }

      const nodeStart = node.start_char;
      for (const anchor of node.anchors ?? []) {
        // Add global positions for UI rendering (snake_case for API type consistency)
        anchor.global_start = nodeStart + anchor.start;
        anchor.global_end = nodeStart + anchor.end;
      }
    }

    return anchors;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[api] Failed to parse anchors_json:', json?.slice(0, 100), err);
    }
    return null;
  }
}

// ============================================================================
// Error handling
// ============================================================================

export class ApiError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

export async function handleResponse<T>(response: Response): Promise<T> {
  const json = (await response.json().catch((error: unknown) => {
    if (error instanceof Error && error.name === 'AbortError')
      throw new ApiError('ABORTED', 'Request was cancelled');
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new ApiError('TIMEOUT', 'Request timed out while loading data');
    return { success: false, error: { code: 'PARSE_ERROR', message: 'Failed to parse response' } };
  })) as ApiResponse<T>;

  if (!response.ok || !json.success) {
    throw new ApiError(
      json.error?.code || 'UNKNOWN_ERROR',
      json.error?.message || `HTTP ${response.status}`,
      (json.error as { details?: Record<string, unknown> })?.details
    );
  }
  return json.data as T;
}

// ============================================================================
// Fetch utilities
// ============================================================================

/**
 * Browser credentials are injected by the same-origin BFF, never by JavaScript.
 * Kept for streaming callers that share this request setup.
 */
export async function injectAuthHeaders(headers: Headers): Promise<Headers> {
  return headers;
}

function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}

// The deadline covers all attempts and backoff. Mutations and declared BFF failures never retry.
export async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT,
  externalSignal?: AbortSignal
): Promise<Response> {
  const method = (options?.method || 'GET').toUpperCase();
  const maxAttempts = method === 'GET' || method === 'HEAD' ? 3 : 1;
  const deadline = AbortSignal.timeout(timeoutMs);
  const signals = [options?.signal, externalSignal, deadline].filter(
    (signal): signal is AbortSignal => Boolean(signal)
  );
  const signal = AbortSignal.any(signals);
  const headers = await injectAuthHeaders(new Headers(options?.headers));
  try {
    for (let attempt = 1; ; attempt++) {
      signal.throwIfAborted();
      let response: Response | undefined;
      const trace = traceNavigationRequest(url, method, headers);
      try {
        response = await fetch(url, { ...options, headers: trace?.headers ?? headers, signal });
        trace?.finish(response.status);
      } catch (error) {
        trace?.finish(
          signal.aborted
            ? signal.reason === deadline.reason
              ? 'timeout'
              : 'cancelled'
            : 'network-error'
        );
        if (signal.aborted || attempt >= maxAttempts || !(error instanceof TypeError)) throw error;
      }
      if (response) {
        if (response.status === 401 || response.status === 403) invalidateSessionReads();
        if (
          attempt >= maxAttempts ||
          ![502, 503, 504].includes(response.status) ||
          response.headers.has('x-t3x-request-failure')
        )
          return response;
        void response.body?.cancel().catch(() => {});
      }
      await waitForRetry(250 * 2 ** (attempt - 1), signal);
    }
  } catch (error) {
    if (signal.aborted) {
      if (signal.reason === deadline.reason && deadline.aborted)
        throw new ApiError('TIMEOUT', `Request timed out after ${timeoutMs}ms`);
      throw new ApiError('ABORTED', 'Request was cancelled');
    }
    throw error;
  }
}

// Helper to build query string with proper encoding
export function buildQueryString(
  params: Record<string, string | number | boolean | undefined>
): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }
  return searchParams.toString();
}
