/**
 * L3 — imperative turn-context fetcher.
 *
 * Thin pass-through to the cached L1 adapter. Lives in `queries/` so
 * components (especially under `components/merge/**`) can read turn
 * context without importing `@/lib/api/*` directly.
 */

import { fetchTurnContextCached } from '@/lib/api/turns';
import type { TurnContextData } from '@/types/api';

export interface TurnContextOptions {
  before?: number;
  after?: number;
  highlightStart?: number;
  highlightEnd?: number;
}

export function fetchTurnContext(
  turnHash: string,
  options?: TurnContextOptions
): Promise<TurnContextData> {
  return fetchTurnContextCached(turnHash, options);
}
