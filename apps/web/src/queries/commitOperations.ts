/**
 * L3 — imperative commit operations loader.
 */

import { getApiCommitOperations } from '@/infrastructure/commits';
import type { ApiCommitOperationsResponse } from '@/types/api';

export function fetchCommitOperations(
  commitHash: string,
  projectId?: string
): Promise<ApiCommitOperationsResponse> {
  return getApiCommitOperations(commitHash, projectId);
}
