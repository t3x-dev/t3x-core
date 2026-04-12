/**
 * L3 — imperative "load commit history" helper. Pass-through to the L1
 * commits adapter so components (commit detail page) never import from
 * `@/lib/api/*` directly.
 */

import { getApiCommitHistory } from '@/lib/api/commits';
import type { ApiCommit } from '@/types/api';

export function fetchCommitHistory(commitHash: string, limit = 50): Promise<ApiCommit[]> {
  return getApiCommitHistory(commitHash, limit);
}
