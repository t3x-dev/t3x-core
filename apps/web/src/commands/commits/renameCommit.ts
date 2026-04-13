/**
 * L3 command — rename a commit (update its display message).
 */

import { updateCommitMessage } from '@/infrastructure/commits';
import type { ApiCommit } from '@/types/api';
import { CommitPersistenceError } from './errors';

export async function renameCommit(commitHash: string, message: string): Promise<ApiCommit> {
  try {
    return await updateCommitMessage(commitHash, message);
  } catch (cause) {
    throw new CommitPersistenceError(
      cause instanceof Error ? cause.message : 'renameCommit failed',
      cause
    );
  }
}
