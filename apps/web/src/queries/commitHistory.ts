/**
 * L3 — imperative "load commit history" helper. Pass-through to the L1
 * commits adapter so components (commit detail page) never import from
 * `@/infrastructure/*` directly.
 */

import { getApiCommitHistory } from '@/infrastructure/commits';
import type { ApiCommit } from '@/types/api';

export function fetchCommitHistory(commitHash: string, limit = 50): Promise<ApiCommit[]> {
  return getApiCommitHistory(commitHash, limit);
}
