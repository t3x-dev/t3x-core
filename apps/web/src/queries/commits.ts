/**
 * L3 — commits read pass-through (read-only per v2 §2.3).
 *
 * Writes live in @/commands/commits per v2 §2.4.
 * The pure anchor parser moved to @/domain/commitAnchors — consumers
 * now import from there directly. `getSemanticContent` is still
 * re-exported here because it's a pure helper alongside list reads.
 */

import { getSemanticContent, listCommits } from '@/infrastructure/commits';
import type { ApiCommit } from '@/types/api';

export function fetchCommits(
  projectId: string,
  branch?: string,
  limit = 100
): Promise<ApiCommit[]> {
  return listCommits(projectId, branch, limit);
}

export { getSemanticContent };
