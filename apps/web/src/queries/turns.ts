/**
 * L3 — imperative turn-list fetcher. Wraps the L1 `listTurns` adapter so
 * components don't import from `@/lib/api/turns` directly.
 */

import { listTurns } from '@/lib/api/turns';
import type { TurnListData } from '@/lib/api/types';

export interface FetchTurnsOptions {
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
  order?: 'asc' | 'desc';
}

export function fetchTurns(
  projectId: string,
  conversationId: string,
  options?: FetchTurnsOptions
): Promise<TurnListData> {
  const { limit = 100, offset = 0, signal, order } = options ?? {};
  return listTurns(projectId, conversationId, limit, offset, { signal, order });
}
