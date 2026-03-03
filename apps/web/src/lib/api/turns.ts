/**
 * Turns API + Turn Context + Cache
 */

import {
  API_V1,
  buildQueryString,
  DEFAULT_TIMEOUT,
  fetchWithTimeout,
  handleResponse,
} from './core';
import type { Turn, TurnDetail, TurnListData } from './types';

// ============================================================================
// Turns CRUD
// ============================================================================

export async function listTurns(
  projectId: string,
  conversationId: string,
  limit = 100,
  offset = 0,
  options?: {
    signal?: AbortSignal;
    /** Sort order: 'asc' (oldest first) or 'desc' (newest first). Default: 'asc' */
    order?: 'asc' | 'desc';
  }
): Promise<TurnListData> {
  const query = buildQueryString({
    project_id: projectId,
    conversation_id: conversationId,
    limit,
    offset,
    order: options?.order,
  });
  const res = await fetchWithTimeout(
    `${API_V1}/turns?${query}`,
    undefined,
    DEFAULT_TIMEOUT,
    options?.signal
  );
  return handleResponse<TurnListData>(res);
}

export async function getTurn(turnHash: string): Promise<TurnDetail> {
  // Validate turnHash to prevent /api/v1/turns/undefined errors
  if (!turnHash || turnHash === 'undefined') {
    throw new Error('getTurn: turnHash is required');
  }
  // Don't encode the colon in sha256:xxx - backend expects raw format
  const res = await fetchWithTimeout(`${API_V1}/turns/${turnHash}`);
  return handleResponse<TurnDetail>(res);
}

export async function createTurn(
  projectId: string,
  conversationId: string,
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string,
  language?: 'zh' | 'en' | 'auto'
): Promise<Turn> {
  const res = await fetchWithTimeout(`${API_V1}/turns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      conversation_id: conversationId,
      role,
      content,
      language,
    }),
  });
  return handleResponse<Turn>(res);
}

// ============================================================================
// Turn Context (for source tracing)
// ============================================================================

/**
 * Turn with context highlight information (from /turns/:hash/context API)
 */
export interface TurnWithContext {
  turn_hash: string;
  parent_turn_hash: string | null;
  project_id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  language?: string | null;
  rings?: unknown;
  created_at: string;
  is_target: boolean;
  highlight?: {
    start: number;
    end: number;
  };
}

/**
 * Turn context data from API (for source tracing)
 */
export interface TurnContextData {
  target_turn: TurnWithContext;
  context: TurnWithContext[];
  conversation_id: string;
  conversation_title: string | null;
}

/**
 * Fetch turn with surrounding context for source tracing
 *
 * @param turnHash - The turn hash to fetch context for
 * @param options - Optional parameters for context window and highlight
 * @returns Turn context data including surrounding turns
 */
export async function fetchTurnContext(
  turnHash: string,
  options?: {
    before?: number;
    after?: number;
    highlightStart?: number;
    highlightEnd?: number;
  }
): Promise<TurnContextData> {
  if (!turnHash || turnHash === 'undefined') {
    throw new Error('fetchTurnContext: turnHash is required');
  }

  const params = new URLSearchParams();
  if (options?.before !== undefined) {
    params.set('before', String(options.before));
  }
  if (options?.after !== undefined) {
    params.set('after', String(options.after));
  }
  if (options?.highlightStart !== undefined) {
    params.set('highlight_start', String(options.highlightStart));
  }
  if (options?.highlightEnd !== undefined) {
    params.set('highlight_end', String(options.highlightEnd));
  }

  const queryString = params.toString();
  const url = `${API_V1}/turns/${turnHash}/context${queryString ? `?${queryString}` : ''}`;
  const res = await fetchWithTimeout(url);
  return handleResponse<TurnContextData>(res);
}

// ============================================================================
// Turn Context Cache & Batch
// ============================================================================

/** Cache for turn context data to avoid redundant requests */
const turnContextCache = new Map<string, { data: TurnContextData; timestamp: number }>();

/** Cache TTL in milliseconds (5 minutes) */
const TURN_CONTEXT_CACHE_TTL = 5 * 60 * 1000;

/** In-flight requests to dedupe concurrent requests */
const inflightRequests = new Map<string, Promise<TurnContextData>>();

/**
 * Build cache key for turn context
 */
function buildTurnContextCacheKey(
  turnHash: string,
  options?: { before?: number; after?: number }
): string {
  return `${turnHash}:${options?.before ?? 1}:${options?.after ?? 1}`;
}

/**
 * Fetch turn context with caching and request deduplication
 *
 * @param turnHash - The turn hash to fetch
 * @param options - Context window options and optional highlight positions
 * @returns Turn context data (from cache or fresh)
 */
export async function fetchTurnContextCached(
  turnHash: string,
  options?: {
    before?: number;
    after?: number;
    highlightStart?: number;
    highlightEnd?: number;
  }
): Promise<TurnContextData> {
  const cacheKey = buildTurnContextCacheKey(turnHash, options);

  // Check cache first
  const cached = turnContextCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TURN_CONTEXT_CACHE_TTL) {
    return cached.data;
  }

  // Check if request is already in flight
  const inflight = inflightRequests.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  // Make the request
  const requestPromise = fetchTurnContext(turnHash, options)
    .then((data) => {
      // Cache the result
      turnContextCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    })
    .finally(() => {
      // Remove from in-flight
      inflightRequests.delete(cacheKey);
    });

  // Track in-flight request
  inflightRequests.set(cacheKey, requestPromise);

  return requestPromise;
}

/**
 * Batch fetch turn contexts with caching
 *
 * Fetches multiple turn contexts in parallel, utilizing cache and
 * deduplicating concurrent requests for the same turn.
 *
 * @param turnHashes - Array of turn hashes to fetch
 * @param options - Context window options (applied to all)
 * @returns Map of turnHash to TurnContextData (or null on error)
 */
export async function fetchTurnContextBatch(
  turnHashes: string[],
  options?: { before?: number; after?: number }
): Promise<Map<string, TurnContextData | null>> {
  const results = new Map<string, TurnContextData | null>();

  // Dedupe input
  const uniqueHashes = [...new Set(turnHashes)];

  // Fetch all in parallel with caching
  await Promise.all(
    uniqueHashes.map(async (turnHash) => {
      try {
        const data = await fetchTurnContextCached(turnHash, options);
        results.set(turnHash, data);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[fetchTurnContextBatch] Failed for ${turnHash}:`, err);
        }
        results.set(turnHash, null);
      }
    })
  );

  return results;
}

/**
 * Clear the turn context cache
 * Useful when data may have changed
 */
export function clearTurnContextCache(): void {
  turnContextCache.clear();
  inflightRequests.clear();
}
