import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { type BranchLinearityError, createCommit } from '../queries/commits';
import { insertProject } from '../queries/projects';
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
});
