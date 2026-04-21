/**
 * API client core infrastructure - shared utilities
 */

import { API_BASE as RESOLVED_API_BASE } from '@/utils/apiBase';
import type { ApiCommitAnchors, ApiResponse } from './types';

// Use standalone API if configured, otherwise fall back to embedded routes
export const API_BASE = RESOLVED_API_BASE;
export const API_V1 = `${API_BASE}/api/v1`;
export const DEFAULT_TIMEOUT = 10000;

// API key for authenticated requests (optional, for production use)
export const API_KEY = process.env.NEXT_PUBLIC_T3X_API_KEY;

/**
 * Get API key from session cookie (client-side only).
 * Reads the t3x-session cookie set by the login page.
 */
async function getSessionApiKey(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { getSessionKey } = await import('@/infrastructure/session');
    return getSessionKey();
  } catch {
    return null;
  }
}

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
  const json = (await response.json().catch(() => ({
    success: false,
    error: { code: 'PARSE_ERROR', message: 'Failed to parse response' },
  }))) as ApiResponse<T>;

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
 * Inject Authorization header: static env var → session cookie → none.
 * Exported so streaming functions (which bypass fetchWithTimeout) can reuse auth.
 */
export async function injectAuthHeaders(headers: Headers): Promise<Headers> {
  if (!headers.has('Authorization')) {
    if (API_KEY) {
      headers.set('Authorization', `Bearer ${API_KEY}`);
    } else {
      const sessionKey = await getSessionApiKey();
      if (sessionKey) {
        headers.set('Authorization', `Bearer ${sessionKey}`);
      }
    }
  }
  return headers;
}

// Single fetch attempt with timeout + abort support
async function fetchOnce(
  url: string,
  options?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Link external signal to our controller
  const abortHandler = () => controller.abort();
  externalSignal?.addEventListener('abort', abortHandler);

  const headers = await injectAuthHeaders(new Headers(options?.headers));

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      // Check if it was external abort vs timeout
      if (externalSignal?.aborted) {
        throw new ApiError('ABORTED', 'Request was cancelled');
      }
      throw new ApiError('TIMEOUT', `Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortHandler);
  }
}

// Fetch with timeout wrapper + automatic retry for GET requests.
// GET requests (no method or method='GET') retry up to 3 times on server/network errors
// with exponential backoff (500ms -> 1s -> 2s). Non-GET requests are never retried.
export async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT,
  externalSignal?: AbortSignal
): Promise<Response> {
  const method = (options?.method || 'GET').toUpperCase();
  const isIdempotent = method === 'GET' || method === 'HEAD';
  const maxAttempts = isIdempotent ? 3 : 1;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchOnce(url, options, timeoutMs, externalSignal);
      // Don't retry on success or client errors (4xx)
      if (
        response.ok ||
        (response.status >= 400 && response.status < 500) ||
        attempt >= maxAttempts
      ) {
        return response;
      }
      // Server error (5xx) — retry with backoff
      lastError = new ApiError('SERVER_ERROR', `HTTP ${response.status}`);
    } catch (err) {
      // Never retry aborted or timed-out requests
      if (err instanceof ApiError && (err.code === 'ABORTED' || err.code === 'TIMEOUT')) {
        throw err;
      }
      lastError = err;
      if (attempt >= maxAttempts) throw err;
    }
    // Exponential backoff: 500ms, 1000ms, 2000ms
    const delay = 500 * 2 ** (attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw lastError;
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
