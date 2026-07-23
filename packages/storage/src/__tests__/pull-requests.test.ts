import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertProject } from '../queries/projects';
import {
  addPullRequestActivity,
  createPullRequest,
  findActivePullRequestByBranches,
  findPullRequestByNumber,
  listPullRequestActivity,
  listPullRequestChecks,
  listPullRequestsByProject,
  replacePullRequestChecks,
  updatePullRequest,
} from '../queries/pull-requests';
import { createTestDB, testData } from './setup';

describe('Pull Requests Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    projectId = (await insertProject(db, testData.project({ name: 'Pull Requests Test' })))
      .projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('persists numbered pull requests and prevents duplicate active branch pairs', async () => {
    const first = await createPullRequest(db, {
      projectId,
      title: 'Feature merge',
      sourceBranch: 'feature',
      targetBranch: 'main',
      sourceCommitHash: 'sha256:source',
      targetBaseCommitHash: 'sha256:target',
      authorId: 'user_1',
    });
    const second = await createPullRequest(db, {
      projectId,
      title: 'Second feature merge',
      sourceBranch: 'feature-2',
      targetBranch: 'main',
      sourceCommitHash: 'sha256:source-2',
      targetBaseCommitHash: 'sha256:target',
      authorId: 'user_1',
    });

    expect(first.number).toBe(1);
    expect(second.number).toBe(2);
    expect(await findPullRequestByNumber(db, projectId, 1)).toMatchObject({
      pullRequestId: first.pullRequestId,
      status: 'open',
    });
    expect(await listPullRequestsByProject(db, projectId)).toHaveLength(2);
    expect(await findActivePullRequestByBranches(db, projectId, 'feature', 'main')).toMatchObject({
      pullRequestId: first.pullRequestId,
    });

    await expect(
      createPullRequest(db, {
        projectId,
        title: 'Duplicate active PR',
        sourceBranch: 'feature',
        targetBranch: 'main',
        sourceCommitHash: 'sha256:new-source',
        targetBaseCommitHash: 'sha256:target',
        authorId: 'user_2',
      })
    ).rejects.toThrow();
  });

  it('persists readiness checks, activity, and terminal merge metadata', async () => {
    const pullRequest = await createPullRequest(db, {
      projectId,
      title: 'Ready feature',
      sourceBranch: 'ready-feature',
      targetBranch: 'main',
      sourceCommitHash: 'sha256:ready-source',
      targetBaseCommitHash: 'sha256:target',
      authorId: 'user_1',
      status: 'ready',
    });

    await replacePullRequestChecks(db, pullRequest.pullRequestId, [
      {
        kind: 'source_commit',
        status: 'passed',
        title: 'Source commit',
        message: 'Source exists.',
        completedAt: new Date(),
      },
      {
        kind: 'merge_simulation',
        status: 'passed',
        title: 'Merge simulation',
        completedAt: new Date(),
      },
    ]);
    await addPullRequestActivity(db, pullRequest.pullRequestId, {
      actorId: 'user_1',
      type: 'created',
      message: 'Pull request created.',
    });

    expect(await listPullRequestChecks(db, pullRequest.pullRequestId)).toHaveLength(2);
    expect(await listPullRequestActivity(db, pullRequest.pullRequestId)).toMatchObject([
      { type: 'created', message: 'Pull request created.' },
    ]);

    const mergedAt = new Date();
    const merged = await updatePullRequest(db, pullRequest.pullRequestId, {
      status: 'merged',
      mergeCommitHash: 'sha256:merge',
      mergedAt,
    });
    expect(merged).toMatchObject({
      status: 'merged',
      mergeCommitHash: 'sha256:merge',
      mergedAt,
    });
    expect(
      await findActivePullRequestByBranches(db, projectId, 'ready-feature', 'main')
    ).toBeNull();
  });
});
