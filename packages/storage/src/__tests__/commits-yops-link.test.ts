/**
 * Commit yops_log_ids Tests
 *
 * Verifies that commits can store and retrieve yops_log_ids (second-class field).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createCommit, getCommit } from '../queries/commits';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

describe('Commit yops_log_ids', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(db, testData.project({ name: 'YOps Link Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('creates commit with yops_log_ids and retrieves them', async () => {
    const commit = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'test', slots: { v: '1' }, children: [] }], relations: [] },
      project_id: testProjectId,
      message: 'test commit with yops',
      yops_log_ids: ['yl_abc123', 'yl_def456'],
    });
    expect(commit.yops_log_ids).toEqual(['yl_abc123', 'yl_def456']);

    const retrieved = await getCommit(db, commit.hash);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.yops_log_ids).toEqual(['yl_abc123', 'yl_def456']);
  });

  it('defaults yops_log_ids to empty array when not provided', async () => {
    const commit = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'test2', slots: { v: '2' }, children: [] }], relations: [] },
      project_id: testProjectId,
      message: 'test commit without yops',
    });
    expect(commit.yops_log_ids).toEqual([]);
  });
});
