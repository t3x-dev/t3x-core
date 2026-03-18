import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertBranch } from '../queries/branches';
import { createCommit } from '../queries/commits';
import {
  deleteEditsByLeafId,
  findEditsByLeafId,
  findEditsByProject,
  insertLeafOutputEdit,
} from '../queries/leaf-output-edits';
import { createLeaf } from '../queries/leaves';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

describe('Leaf Output Edits Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testLeafId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Edit Tracking Test' }));
    testProjectId = project.projectId;

    // Create a branch + commit + leaf for testing
    await insertBranch(db, {
      projectId: testProjectId,
      name: 'main',
    });

    const commit = await createCommit(db, {
      project_id: testProjectId,
      branch: 'main',
      author: { type: 'human', id: 'test', name: 'Test User' },
      message: 'test commit',
      sentences: [{ id: 's_001', text: 'Test sentence', confidence: 0.9 }],
      parent_hashes: [],
    });

    const leaf = await createLeaf(db, {
      commit_hash: commit.hash,
      type: 'email',
      title: 'Test Email',
      project_id: testProjectId,
    });
    testLeafId = leaf.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // insertLeafOutputEdit
  // =========================================================================
  describe('insertLeafOutputEdit', () => {
    it('creates an edit record with all fields', async () => {
      const edit = await insertLeafOutputEdit(db, {
        leaf_id: testLeafId,
        project_id: testProjectId,
        original_output: 'Hi John, here is your report.',
        modified_output: 'Dear Mr. Johnson, please find your report attached.',
      });

      expect(edit).toBeDefined();
      expect(edit.id).toMatch(/^ledit_/);
      expect(edit.leafId).toBe(testLeafId);
      expect(edit.projectId).toBe(testProjectId);
      expect(edit.originalOutput).toBe('Hi John, here is your report.');
      expect(edit.modifiedOutput).toBe('Dear Mr. Johnson, please find your report attached.');
      expect(edit.createdAt).toBeDefined();
    });

    it('creates multiple edits for the same leaf', async () => {
      await insertLeafOutputEdit(db, {
        leaf_id: testLeafId,
        project_id: testProjectId,
        original_output: 'Best regards',
        modified_output: 'Sincerely',
      });

      const edits = await findEditsByLeafId(db, testLeafId);
      expect(edits.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // findEditsByLeafId
  // =========================================================================
  describe('findEditsByLeafId', () => {
    it('returns edits ordered by created_at desc', async () => {
      const edits = await findEditsByLeafId(db, testLeafId);
      expect(edits.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < edits.length; i++) {
        expect(new Date(edits[i - 1].createdAt!).getTime()).toBeGreaterThanOrEqual(
          new Date(edits[i].createdAt!).getTime()
        );
      }
    });

    it('respects limit', async () => {
      const edits = await findEditsByLeafId(db, testLeafId, { limit: 1 });
      expect(edits.length).toBe(1);
    });

    it('returns empty for non-existent leaf', async () => {
      const edits = await findEditsByLeafId(db, 'leaf_nonexistent');
      expect(edits.length).toBe(0);
    });
  });

  // =========================================================================
  // findEditsByProject
  // =========================================================================
  describe('findEditsByProject', () => {
    it('returns all edits for the project', async () => {
      const edits = await findEditsByProject(db, testProjectId);
      expect(edits.length).toBeGreaterThanOrEqual(2);
      for (const e of edits) {
        expect(e.projectId).toBe(testProjectId);
      }
    });

    it('returns empty for non-existent project', async () => {
      const edits = await findEditsByProject(db, 'proj_nonexistent');
      expect(edits.length).toBe(0);
    });
  });

  // =========================================================================
  // deleteEditsByLeafId
  // =========================================================================
  describe('deleteEditsByLeafId', () => {
    it('deletes all edits for a leaf', async () => {
      const countBefore = (await findEditsByLeafId(db, testLeafId)).length;
      expect(countBefore).toBeGreaterThan(0);

      const deleted = await deleteEditsByLeafId(db, testLeafId);
      expect(deleted).toBe(countBefore);

      const countAfter = (await findEditsByLeafId(db, testLeafId)).length;
      expect(countAfter).toBe(0);
    });
  });
});
