/**
 * L3 — commits read/write pass-through for slices and canvas components.
 *
 * `fetchCommits` is a list variant (different from `fetchCommitByHash` in
 * `queries/commitByHash.ts` which loads one commit by hash). `persistCommitPosition`
 * is a thin write wrapper used by the canvas drag layer.
 *
 * Re-exports two pure helpers from the L1 commits module so slices and
 * components can format commit content without crossing the `@/lib/api/**`
 * biome ban: `getSemanticContent`, `parseApiCommitAnchors`.
 */

import {
  getSemanticContent,
  listCommits,
  updateCommitMessage,
  updateCommitPosition,
} from '@/lib/api/commits';
import { parseApiCommitAnchors } from '@/lib/api/leaves';
import type { ApiCommit } from '@/types/api';

export function fetchCommits(
  projectId: string,
  branch?: string,
  limit = 100
): Promise<ApiCommit[]> {
  return listCommits(projectId, branch, limit);
}

export function persistCommitPosition(
  commitHash: string,
  x: number,
  y: number
): Promise<ApiCommit> {
  return updateCommitPosition(commitHash, x, y);
}

export function renameCommit(commitHash: string, message: string): Promise<ApiCommit> {
  return updateCommitMessage(commitHash, message);
}

export { getSemanticContent, parseApiCommitAnchors };
