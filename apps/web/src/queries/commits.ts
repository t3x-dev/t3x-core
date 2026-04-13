/**
 * L3 — commits read pass-through (read-only per v2 §2.3).
 *
 * Writes (createCommit, persistCommitPosition, renameCommit) live in
 * @/commands/commits per v2 §2.4.
 *
 * Re-exports two pure helpers from @/infrastructure/* so slices and
 * components can format commit content without crossing infra
 * boundaries: `getSemanticContent`, `parseApiCommitAnchors`. (These
 * are pure functions, not I/O; they are eligible to move to @/domain/
 * in a follow-up cleanup.)
 */

import { getSemanticContent, listCommits } from '@/infrastructure/commits';
import { parseApiCommitAnchors } from '@/infrastructure/leaves';
import type { ApiCommit } from '@/types/api';

export function fetchCommits(
  projectId: string,
  branch?: string,
  limit = 100
): Promise<ApiCommit[]> {
  return listCommits(projectId, branch, limit);
}

export { getSemanticContent, parseApiCommitAnchors };
