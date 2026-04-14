/**
 * L3 — commits read pass-through (read-only per v2 §2.3).
 *
 * Writes live in @/commands/commits per v2 §2.4.
 * Pure helpers moved to @/domain/:
 *   - parseApiCommitAnchors -> @/domain/commitAnchors
 *   - getSemanticContent / treeSummaryText -> @/domain/commitContent
 */

import { listCommits } from '@/infrastructure/commits';
import type { ApiCommit } from '@/types/api';

export function fetchCommits(
  projectId: string,
  branch?: string,
  limit = 100
): Promise<ApiCommit[]> {
  return listCommits(projectId, branch, limit);
}
