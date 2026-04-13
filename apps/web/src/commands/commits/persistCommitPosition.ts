/**
 * L3 command — persist a commit's canvas position.
 *
 * Best-effort write. Callers (canvas drag layer) do not block the UI
 * on this; they swallow rejections so a temporary network blip never
 * stops drag-and-drop. Errors are still wrapped in
 * CommitPersistenceError so observability hooks can surface them
 * later.
 */

import { updateCommitPosition } from '@/infrastructure/commits';
import type { ApiCommit } from '@/types/api';
import { CommitPersistenceError } from './errors';

export async function persistCommitPosition(
  commitHash: string,
  x: number,
  y: number
): Promise<ApiCommit> {
  try {
    return await updateCommitPosition(commitHash, x, y);
  } catch (cause) {
    throw new CommitPersistenceError(
      cause instanceof Error ? cause.message : 'persistCommitPosition failed',
      cause
    );
  }
}
