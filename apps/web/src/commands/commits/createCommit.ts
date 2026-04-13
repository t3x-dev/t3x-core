/**
 * L3 command — create a commit for a project.
 *
 * Thin wrapper over the infra adapter so the public write entry lives at
 * @/commands/commits (v2 §2.4).
 */

import { createCommit as createCommitInfra } from '@/infrastructure/commits';

type InfraCreateOptions = Parameters<typeof createCommitInfra>[2];

export async function createCommit(
  projectId: string,
  content: { trees: unknown[]; relations: unknown[] },
  options?: InfraCreateOptions
): Promise<{ commit: { hash: string } }> {
  return createCommitInfra(projectId, content, options);
}

export type CreateCommitOptions = InfraCreateOptions;
