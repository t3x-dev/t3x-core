import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createLeaf, findLeavesByCommit } from '../queries/leaves';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

describe('findLeavesByCommit project isolation', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let ownerProjectId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    ownerProjectId = (await insertProject(db, testData.project({ name: 'Owner leaf project' })))
      .projectId;
    otherProjectId = (await insertProject(db, testData.project({ name: 'Other leaf project' })))
      .projectId;

    for (const projectId of [ownerProjectId, otherProjectId]) {
      await createLeaf(db, {
        commit_hash: 'sha256:shared-leaf-commit',
        type: 'plan',
        title: projectId,
        project_id: projectId,
      });
    }
  });

  afterAll(async () => {
    await cleanup();
  });

  it('filters offset results to the authorized project', async () => {
    const leaves = await findLeavesByCommit(db, 'sha256:shared-leaf-commit', {
      projectId: ownerProjectId,
    });

    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.project_id).toBe(ownerProjectId);
  });

  it('filters cursor results to the authorized project', async () => {
    const page = await findLeavesByCommit(db, 'sha256:shared-leaf-commit', {
      projectId: otherProjectId,
      cursor: '',
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.project_id).toBe(otherProjectId);
  });
});
