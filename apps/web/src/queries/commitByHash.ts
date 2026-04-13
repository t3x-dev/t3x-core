/**
 * L3 — imperative "load one commit" helper.
 *
 * Components that need ad-hoc commit lookups (e.g. the merge workspace
 * reading source + target commits) call this instead of reaching into
 * `@/lib/api/commits`. Consolidates what was otherwise a half-dozen
 * direct `getApiCommit` imports across the codebase.
 */

import { getApiCommit } from '@/infrastructure/commits';
import type { ApiCommit } from '@/types/api';

export function fetchCommitByHash(hash: string): Promise<ApiCommit> {
  return getApiCommit(hash);
}
