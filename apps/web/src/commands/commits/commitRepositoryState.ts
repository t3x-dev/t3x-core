/** L3 command for the server-owned CommitV2 Transition write path. */

import { commitRepositoryState as persistRepositoryState } from '@/infrastructure/commits';
import { CommitPersistenceError } from './errors';

type InfraCommitRepositoryStateOptions = Parameters<typeof persistRepositoryState>[2];

export async function commitRepositoryState(
  projectId: string,
  content: { trees: unknown[]; relations: unknown[] },
  options: InfraCommitRepositoryStateOptions
): ReturnType<typeof persistRepositoryState> {
  try {
    return await persistRepositoryState(projectId, content, options);
  } catch (cause) {
    throw new CommitPersistenceError(
      cause instanceof Error ? cause.message : 'Repository State commit failed',
      cause
    );
  }
}

export type CommitRepositoryStateOptions = InfraCommitRepositoryStateOptions;
