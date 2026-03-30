import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  countConflictsByProject,
  dismissConflict,
  findConflictById,
  findConflictsByProject,
  insertConflict,
  resolveConflict,
} from '../queries/knowledge-conflicts';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

describe('Knowledge Conflicts Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Conflict Detection Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // insertConflict
  // =========================================================================
  describe('insertConflict', () => {
    it('creates and returns a typed conflict result', async () => {
      const conflict = await insertConflict(db, {
        project_id: testProjectId,
        new_node_id: 's_new001',
        new_commit_hash: 'sha256:aaa',
        existing_node_id: 's_exist001',
        existing_commit_hash: 'sha256:bbb',
        cosine: 0.92,
        jaccard: 0.45,
      });

      expect(conflict).toBeDefined();
      expect(conflict.id).toMatch(/^kc_/);
      expect(conflict.project_id).toBe(testProjectId);
      expect(conflict.new_node_id).toBe('s_new001');
      expect(conflict.new_commit_hash).toBe('sha256:aaa');
      expect(conflict.existing_node_id).toBe('s_exist001');
      expect(conflict.existing_commit_hash).toBe('sha256:bbb');
      expect(conflict.cosine).toBeCloseTo(0.92);
      expect(conflict.jaccard).toBeCloseTo(0.45);
      expect(conflict.status).toBe('open');
      expect(conflict.resolution).toBeNull();
      expect(conflict.created_at).toBeTruthy();
    });
  });

  // =========================================================================
  // findConflictsByProject
  // =========================================================================
  describe('findConflictsByProject', () => {
    let projId: string;

    beforeAll(async () => {
      const project = await insertProject(db, testData.project({ name: 'List Conflicts Test' }));
      projId = project.projectId;

      await insertConflict(db, {
        project_id: projId,
        new_node_id: 's_a1',
        new_commit_hash: 'sha256:c1',
        existing_node_id: 's_a2',
        existing_commit_hash: 'sha256:c2',
        cosine: 0.88,
        jaccard: 0.4,
      });

      const second = await insertConflict(db, {
        project_id: projId,
        new_node_id: 's_b1',
        new_commit_hash: 'sha256:c3',
        existing_node_id: 's_b2',
        existing_commit_hash: 'sha256:c4',
        cosine: 0.95,
        jaccard: 0.6,
      });
      // Resolve the second one for status filter tests
      await resolveConflict(db, second.id, 'kept_new');
    });

    it('returns all conflicts for a project', async () => {
      const conflicts = await findConflictsByProject(db, projId);
      expect(conflicts).toHaveLength(2);
    });

    it('returns empty array for unknown project', async () => {
      const conflicts = await findConflictsByProject(db, 'proj_nonexistent');
      expect(conflicts).toHaveLength(0);
    });

    it('filters by status', async () => {
      const openConflicts = await findConflictsByProject(db, projId, { status: 'open' });
      expect(openConflicts).toHaveLength(1);
      expect(openConflicts[0].status).toBe('open');

      const resolvedConflicts = await findConflictsByProject(db, projId, { status: 'resolved' });
      expect(resolvedConflicts).toHaveLength(1);
      expect(resolvedConflicts[0].status).toBe('resolved');
    });
  });

  // =========================================================================
  // findConflictById
  // =========================================================================
  describe('findConflictById', () => {
    it('returns a single conflict by ID', async () => {
      const created = await insertConflict(db, {
        project_id: testProjectId,
        new_node_id: 's_find1',
        new_commit_hash: 'sha256:f1',
        existing_node_id: 's_find2',
        existing_commit_hash: 'sha256:f2',
        cosine: 0.91,
        jaccard: 0.5,
      });

      const found = await findConflictById(db, created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.new_node_id).toBe('s_find1');
    });

    it('returns null for non-existent ID', async () => {
      const found = await findConflictById(db, 'kc_nonexistent');
      expect(found).toBeNull();
    });
  });

  // =========================================================================
  // resolveConflict
  // =========================================================================
  describe('resolveConflict', () => {
    it('sets status to resolved and records resolution', async () => {
      const created = await insertConflict(db, {
        project_id: testProjectId,
        new_node_id: 's_res1',
        new_commit_hash: 'sha256:r1',
        existing_node_id: 's_res2',
        existing_commit_hash: 'sha256:r2',
        cosine: 0.89,
        jaccard: 0.42,
      });

      const resolved = await resolveConflict(db, created.id, 'kept_existing');
      expect(resolved).toBeDefined();
      expect(resolved!.status).toBe('resolved');
      expect(resolved!.resolution).toBe('kept_existing');
    });

    it('returns null for non-existent ID', async () => {
      const resolved = await resolveConflict(db, 'kc_nonexistent', 'merged');
      expect(resolved).toBeNull();
    });
  });

  // =========================================================================
  // dismissConflict
  // =========================================================================
  describe('dismissConflict', () => {
    it('sets status to dismissed', async () => {
      const created = await insertConflict(db, {
        project_id: testProjectId,
        new_node_id: 's_dis1',
        new_commit_hash: 'sha256:d1',
        existing_node_id: 's_dis2',
        existing_commit_hash: 'sha256:d2',
        cosine: 0.87,
        jaccard: 0.38,
      });

      const dismissed = await dismissConflict(db, created.id);
      expect(dismissed).toBeDefined();
      expect(dismissed!.status).toBe('dismissed');
      expect(dismissed!.resolution).toBe('dismissed');
    });

    it('returns null for non-existent ID', async () => {
      const dismissed = await dismissConflict(db, 'kc_nonexistent');
      expect(dismissed).toBeNull();
    });
  });

  // =========================================================================
  // countConflictsByProject
  // =========================================================================
  describe('countConflictsByProject', () => {
    let countProjId: string;

    beforeAll(async () => {
      const project = await insertProject(db, testData.project({ name: 'Count Conflicts Test' }));
      countProjId = project.projectId;

      // Insert 3 open conflicts
      for (let i = 0; i < 3; i++) {
        await insertConflict(db, {
          project_id: countProjId,
          new_node_id: `s_cnt_new_${i}`,
          new_commit_hash: `sha256:cnt_${i}`,
          existing_node_id: `s_cnt_exist_${i}`,
          existing_commit_hash: `sha256:cnt_e_${i}`,
          cosine: 0.9,
          jaccard: 0.5,
        });
      }

      // Dismiss one
      const conflicts = await findConflictsByProject(db, countProjId);
      await dismissConflict(db, conflicts[0].id);
    });

    it('returns total count for project', async () => {
      const count = await countConflictsByProject(db, countProjId);
      expect(count).toBe(3);
    });

    it('returns count filtered by status', async () => {
      const openCount = await countConflictsByProject(db, countProjId, 'open');
      expect(openCount).toBe(2);

      const dismissedCount = await countConflictsByProject(db, countProjId, 'dismissed');
      expect(dismissedCount).toBe(1);
    });

    it('returns 0 for unknown project', async () => {
      const count = await countConflictsByProject(db, 'proj_nonexistent');
      expect(count).toBe(0);
    });
  });
});
