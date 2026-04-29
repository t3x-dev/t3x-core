import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createCommit, type MainBranchLinearityError } from '../queries/commits';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

const content = {
  trees: [{ key: 'topic', slots: { text: 'value' }, children: [] }],
  relations: [],
};
const author = { type: 'human' as const, name: 'test' };

describe('main branch linearity', () => {
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
      enforceMainLinearity: true,
    });

    const child = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      parents: [root.hash],
      branch: 'main',
      enforceMainLinearity: true,
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
      enforceMainLinearity: true,
    });

    await expect(
      createCommit(db, {
        author,
        content,
        project_id: project.projectId,
        branch: 'main',
        enforceMainLinearity: true,
      })
    ).rejects.toMatchObject({
      name: 'MainBranchLinearityError',
      code: 'MAIN_ROOT_EXISTS',
    } satisfies Partial<MainBranchLinearityError>);
  });

  it('rejects a main child from an older main commit but allows a branch child', async () => {
    const project = await insertProject(db, testData.project({ name: 'Main sibling reject' }));
    const root = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      branch: 'main',
      enforceMainLinearity: true,
    });
    await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      parents: [root.hash],
      branch: 'main',
      enforceMainLinearity: true,
    });

    await expect(
      createCommit(db, {
        author,
        content,
        project_id: project.projectId,
        parents: [root.hash],
        branch: 'main',
        enforceMainLinearity: true,
      })
    ).rejects.toMatchObject({
      name: 'MainBranchLinearityError',
      code: 'MAIN_NOT_HEAD',
    } satisfies Partial<MainBranchLinearityError>);

    const branchCommit = await createCommit(db, {
      author,
      content,
      project_id: project.projectId,
      parents: [root.hash],
      branch: 'branch-one',
      enforceMainLinearity: true,
    });
    expect(branchCommit.branch).toBe('branch-one');
  });
});
