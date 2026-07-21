import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { findBranchByName } from '../queries/branches';
import {
  type BranchLinearityError,
  type CommitParentIntegrityError,
  createCommit,
  getLatestCommit,
} from '../queries/commits';
import { insertProject } from '../queries/projects';
import { commits } from '../schema-commits';
import { createTestDB, testData } from './setup';

const content = {
  trees: [{ key: 'topic', slots: { text: 'value' }, children: [] }],
  relations: [],
};
const author = { type: 'human' as const, name: 'test' };

describe('branch linearity', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('allows a root main commit then a child from the current main head', async () => {
    const project = await insertProject(db, testData.project({ name: 'Main linear success' }));
    const root = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      branch: 'main',
      enforceBranchLinearity: true,
    });

    const child = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      parents: [root.hash],
      branch: 'main',
      enforceBranchLinearity: true,
    });

    expect(child.parents).toEqual([root.hash]);
    expect(child.branch).toBe('main');
    expect(await findBranchByName(db, project.projectId, 'main')).toMatchObject({
      headCommitHash: child.hash,
      parentBranch: null,
    });
  });

  it('rejects a second root main commit when enforcement is enabled', async () => {
    const project = await insertProject(db, testData.project({ name: 'Main root reject' }));
    await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      branch: 'main',
      enforceBranchLinearity: true,
    });

    await expect(
      createCommit(db, {
        author,
        content,
        project_id: project.projectId,
        branch: 'main',
        enforceBranchLinearity: true,
      })
    ).rejects.toMatchObject({
      name: 'BranchLinearityError',
      code: 'BRANCH_ROOT_EXISTS',
    } satisfies Partial<BranchLinearityError>);
  });

  it('rejects a main child from an older main commit but allows a branch child', async () => {
    const project = await insertProject(db, testData.project({ name: 'Main sibling reject' }));
    const root = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      branch: 'main',
      enforceBranchLinearity: true,
    });
    await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      parents: [root.hash],
      branch: 'main',
      enforceBranchLinearity: true,
    });

    await expect(
      createCommit(db, {
        author,
        content,
        project_id: project.projectId,
        parents: [root.hash],
        branch: 'main',
        enforceBranchLinearity: true,
      })
    ).rejects.toMatchObject({
      name: 'BranchLinearityError',
      code: 'BRANCH_NOT_HEAD',
    } satisfies Partial<BranchLinearityError>);

    const branchCommit = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      parents: [root.hash],
      branch: 'branch-one',
      enforceBranchLinearity: true,
    });
    expect(branchCommit.branch).toBe('branch-one');
    expect(await findBranchByName(db, project.projectId, 'branch-one')).toMatchObject({
      headCommitHash: branchCommit.hash,
      parentBranch: 'main',
    });
  });

  it('rejects reusing an existing branch name from a different fork point', async () => {
    const project = await insertProject(db, testData.project({ name: 'Branch name collision' }));
    const root = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      branch: 'main',
      enforceBranchLinearity: true,
    });
    const mainChild = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      parents: [root.hash],
      branch: 'main',
      enforceBranchLinearity: true,
    });
    const branchRoot = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      parents: [root.hash],
      branch: 'branch-one',
      enforceBranchLinearity: true,
    });

    await expect(
      createCommit(db, {
        author,
        content,
        project_id: project.projectId,
        parents: [mainChild.hash],
        branch: 'branch-one',
        enforceBranchLinearity: true,
      })
    ).rejects.toMatchObject({
      name: 'BranchLinearityError',
      code: 'BRANCH_NOT_HEAD',
    } satisfies Partial<BranchLinearityError>);

    const branchChild = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      parents: [branchRoot.hash],
      branch: 'branch-one',
      enforceBranchLinearity: true,
    });
    expect(branchChild.branch).toBe('branch-one');
  });

  it('rejects committing an existing branch from its older branch node', async () => {
    const project = await insertProject(db, testData.project({ name: 'Branch history reject' }));
    const root = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      branch: 'main',
      enforceBranchLinearity: true,
    });
    const branchRoot = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      parents: [root.hash],
      branch: 'branch-one',
      enforceBranchLinearity: true,
    });
    await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      parents: [branchRoot.hash],
      branch: 'branch-one',
      enforceBranchLinearity: true,
    });

    await expect(
      createCommit(db, {
        author,
        content,
        project_id: project.projectId,
        parents: [branchRoot.hash],
        branch: 'branch-one',
        enforceBranchLinearity: true,
      })
    ).rejects.toMatchObject({
      name: 'BranchLinearityError',
      code: 'BRANCH_NOT_HEAD',
    } satisfies Partial<BranchLinearityError>);
  });

  it('rejects missing and cross-project parents', async () => {
    const source = await insertProject(db, testData.project({ name: 'Parent source' }));
    const target = await insertProject(db, testData.project({ name: 'Parent target' }));
    const sourceRoot = await createCommit(db, {
      author,
      content,
      project_id: source.projectId,
      branch: 'main',
      enforceBranchLinearity: true,
    });

    for (const [parent, code] of [
      ['sha256:missing', 'PARENT_NOT_FOUND'],
      [sourceRoot.hash, 'PARENT_PROJECT_MISMATCH'],
    ] as const) {
      await expect(
        createCommit(db, {
          author,
          content,
          project_id: target.projectId,
          parents: [parent],
          branch: 'main',
          enforceBranchLinearity: true,
        })
      ).rejects.toMatchObject({
        name: 'CommitParentIntegrityError',
        code,
      } satisfies Partial<CommitParentIntegrityError>);
    }
  });

  it('uses the target branch head as first parent and reports the DAG tip', async () => {
    const project = await insertProject(db, testData.project({ name: 'Merge first parent' }));
    const mainHead = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      branch: 'main',
      enforceBranchLinearity: true,
    });
    const featureHead = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      parents: [mainHead.hash],
      branch: 'feature',
      enforceBranchLinearity: true,
    });

    await expect(
      createCommit(db, {
        author,
        content,
        project_id: project.projectId,
        parents: [featureHead.hash, mainHead.hash],
        branch: 'main',
        enforceBranchLinearity: true,
      })
    ).rejects.toMatchObject({ code: 'BRANCH_NOT_HEAD' });

    const merged = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      parents: [mainHead.hash, featureHead.hash],
      branch: 'main',
      enforceBranchLinearity: true,
    });

    // A stale timestamp must not turn an ancestor into the reported head.
    await db
      .update(commits)
      .set({ committedAt: new Date('2099-01-01T00:00:00.000Z') })
      .where(eq(commits.hash, mainHead.hash));
    expect((await getLatestCommit(db, project.projectId, 'main'))?.hash).toBe(merged.hash);
  });

  it('serializes concurrent commits that extend the same branch head', async () => {
    const project = await insertProject(db, testData.project({ name: 'Concurrent branch head' }));
    const root = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      branch: 'main',
      enforceBranchLinearity: true,
    });

    const attempts = await Promise.allSettled([
      createCommit(db, {
        author: { ...author, name: 'first writer' },
        content: { ...content, trees: [{ ...content.trees[0], key: 'first' }] },
        project_id: project.projectId,
        parents: [root.hash],
        branch: 'main',
        enforceBranchLinearity: true,
      }),
      createCommit(db, {
        author: { ...author, name: 'second writer' },
        content: { ...content, trees: [{ ...content.trees[0], key: 'second' }] },
        project_id: project.projectId,
        parents: [root.hash],
        branch: 'main',
        enforceBranchLinearity: true,
      }),
    ]);

    const fulfilled = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof createCommit>>> =>
        attempt.status === 'fulfilled'
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected'
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: 'BRANCH_NOT_HEAD' });
    expect((await getLatestCommit(db, project.projectId, 'main'))?.hash).toBe(
      fulfilled[0]?.value.hash
    );
  });
});
