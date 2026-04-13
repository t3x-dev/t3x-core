/**
 * L3 command — create a commit on a project branch.
 *
 * The hook (useCommitActions.commit) is responsible for assembling
 * `sources` (conversation + selected pins) and providing `provenance`.
 * This module just wraps the infra adapter and translates HTTP errors
 * into CommitPersistenceError so callers pattern-match on instanceof.
 */

import { createCommit as createCommitInfra } from '@/infrastructure/commits';
import { CommitPersistenceError } from './errors';

type InfraCreateOptions = Parameters<typeof createCommitInfra>[2];

export async function createCommit(
  projectId: string,
  content: { trees: unknown[]; relations: unknown[] },
  options?: InfraCreateOptions
): Promise<{ commit: { hash: string } }> {
  try {
    return await createCommitInfra(projectId, content, options);
  } catch (cause) {
    throw new CommitPersistenceError(
      cause instanceof Error ? cause.message : 'createCommit failed',
      cause
    );
  }
}

export type CreateCommitOptions = InfraCreateOptions;
