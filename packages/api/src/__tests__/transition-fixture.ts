import type { SemanticContent } from '@t3x-dev/core';
import { type AnyDB, ensureMainBranch, getTransitionRefHead } from '@t3x-dev/storage';
import {
  commitRepositoryYOpsState,
  createRepositoryYOpsStateFromSemanticContent,
} from '../lib/repository-state-transition';

interface CommitSemanticFixtureInput {
  projectId: string;
  content: SemanticContent;
  refName?: string;
  yopsLogIds?: readonly string[];
  intent?: string;
}

/** Create a real CommitV2 graph from the exact currently observed test ref. */
export async function commitSemanticFixture(db: AnyDB, input: CommitSemanticFixtureInput) {
  const refName = input.refName ?? 'main';
  if (refName === 'main') await ensureMainBranch(db, input.projectId);
  const observed = await getTransitionRefHead(db, { projectId: input.projectId, refName });
  return commitRepositoryYOpsState({
    db,
    projectId: input.projectId,
    refName,
    expectedHead: observed.head,
    target: createRepositoryYOpsStateFromSemanticContent(input.content),
    actor: { kind: 'human', id: 'human:test-fixture' },
    intent: input.intent ?? 'Create test repository state',
    yopsLogIds: input.yopsLogIds,
  });
}
