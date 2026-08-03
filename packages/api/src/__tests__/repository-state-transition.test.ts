import { createYamlSourceState, createYOpsState, describeTransitionObject } from '@t3x-dev/core';
import {
  type AnyDB,
  ensureMainBranch,
  getTransitionRefHead,
  getVerifiedTransitionCommitGraph,
  insertProject,
  listRepositoryDecisionAudit,
  listTransitionCommits,
  TransitionHeadConflictError,
} from '@t3x-dev/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commitRepositoryYOpsState } from '../lib/repository-state-transition';
import { setupTestDB, testData } from './setup';

const HUMAN = { kind: 'human' as const, id: 'user:repository-state-test' };

let db: AnyDB;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
});

afterAll(async () => cleanup());

describe('repository YOps State Transition application service', () => {
  it('persists the complete graph and advances an empty ref through CommitV2 CAS', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Repository State Transition' })
    );
    await ensureMainBranch(db, project.projectId);
    const target = createYOpsState({ service: { enabled: true } });

    const created = await commitRepositoryYOpsState({
      db,
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      target,
      actor: HUMAN,
      intent: 'Enable the service',
      rationale: 'The repository command requested the exact target State.',
    });

    expect(created.transition).toMatchObject({
      mode: 'transition',
      history: { observation: 'committed' },
      audit: { commit: { digest: created.commitDigest } },
    });
    await expect(
      getTransitionRefHead(db, { projectId: project.projectId, refName: 'main' })
    ).resolves.toMatchObject({
      format: 'transition_v2',
      head: created.commitDigest,
      state: target,
    });
    const graph = await getVerifiedTransitionCommitGraph(
      db,
      project.projectId,
      created.commitDigest
    );
    expect(graph?.effect.result).toEqual(describeTransitionObject(target));
    await expect(listTransitionCommits(db, project.projectId)).resolves.toHaveLength(1);
    await expect(
      listRepositoryDecisionAudit(db, { projectId: project.projectId, refName: 'main' })
    ).resolves.toEqual([expect.objectContaining({ outcome: 'accepted' })]);
  });

  it('creates a first-parent CommitV2 chain and rejects a stale observed head', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Repository State CAS Transition' })
    );
    await ensureMainBranch(db, project.projectId);
    const first = await commitRepositoryYOpsState({
      db,
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      target: createYOpsState({ version: 1 }),
      actor: HUMAN,
    });
    const second = await commitRepositoryYOpsState({
      db,
      projectId: project.projectId,
      refName: 'main',
      expectedHead: first.commitDigest,
      target: createYOpsState({ version: 2 }),
      actor: HUMAN,
    });
    const graph = await getVerifiedTransitionCommitGraph(
      db,
      project.projectId,
      second.commitDigest
    );
    expect(graph?.commit.parents.map((parent) => parent.digest)).toEqual([first.commitDigest]);

    await expect(
      commitRepositoryYOpsState({
        db,
        projectId: project.projectId,
        refName: 'main',
        expectedHead: first.commitDigest,
        target: createYOpsState({ version: 3 }),
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(TransitionHeadConflictError);
    await expect(
      getTransitionRefHead(db, { projectId: project.projectId, refName: 'main' })
    ).resolves.toMatchObject({ head: second.commitDigest });
  });

  it('fails explicitly when a task tries to replace a non-YOps State through this adapter', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Repository State Unsupported Codec' })
    );
    await ensureMainBranch(db, project.projectId);

    await expect(
      commitRepositoryYOpsState({
        db,
        projectId: project.projectId,
        refName: 'main',
        expectedHead: null,
        target: createYamlSourceState('device:\n  enabled: true\n'),
        actor: HUMAN,
      })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    await expect(listTransitionCommits(db, project.projectId)).resolves.toEqual([]);
  });
});
