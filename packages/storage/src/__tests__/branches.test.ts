/**
 * Branches Storage Tests
 *
 * Tests all branch operations and verifies database effects.
 * Branches track head commits and support switching.
 */

import type { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  deleteBranch,
  ensureMainBranch,
  findBranchById,
  findBranchByName,
  findBranchesByProject,
  findCurrentBranch,
  insertBranch,
  switchBranch,
  updateBranchHead,
} from '../queries/branches';
import { insertProject } from '../queries/projects';
import { branches } from '../schema';
import { createTestDB, testData } from './setup';

describe('Branches Storage', () => {
  let db: AnyDB;
  let _client: PGlite;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    _client = setup.client;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(db, testData.project({ name: 'Branch Test Project' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('insertBranch', () => {
    it('creates a branch with generated ID', async () => {
      const input = { projectId: testProjectId, name: 'test-branch-1' };

      const result = await insertBranch(db, input);

      expect(result).toBeDefined();
      expect(result.branchId).toMatch(/^branch_[a-f0-9]+$/);
      expect(result.name).toBe('test-branch-1');
      expect(result.projectId).toBe(testProjectId);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('stores the branch in the database', async () => {
      const input = { projectId: testProjectId, name: 'db-stored-branch' };

      const result = await insertBranch(db, input);

      // Verify database effect
      const rows = await db.select().from(branches).where(eq(branches.branchId, result.branchId));

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('db-stored-branch');
      expect(rows[0].projectId).toBe(testProjectId);
    });

    it('first branch in project is marked as current', async () => {
      const newProject = await insertProject(
        db,
        testData.project({ name: 'First Branch Project' })
      );

      const result = await insertBranch(db, { projectId: newProject.projectId, name: 'first' });

      expect(result.isCurrent).toBe(1);
    });

    it('subsequent branches are not marked as current', async () => {
      const newProject = await insertProject(
        db,
        testData.project({ name: 'Second Branch Project' })
      );

      await insertBranch(db, { projectId: newProject.projectId, name: 'first' });
      const second = await insertBranch(db, { projectId: newProject.projectId, name: 'second' });

      expect(second.isCurrent).toBe(0);
    });

    it('stores description when provided', async () => {
      const result = await insertBranch(db, {
        projectId: testProjectId,
        name: 'with-description',
        description: 'This is a feature branch',
      });

      expect(result.description).toBe('This is a feature branch');
    });

    it('records parent branch when provided', async () => {
      await insertBranch(db, { projectId: testProjectId, name: 'parent-branch' });
      const child = await insertBranch(db, {
        projectId: testProjectId,
        name: 'child-branch',
        parentBranch: 'parent-branch',
      });

      expect(child.parentBranch).toBe('parent-branch');
    });
  });

  describe('findBranchByName', () => {
    it('returns the branch when it exists', async () => {
      await insertBranch(db, { projectId: testProjectId, name: 'find-by-name' });

      const found = await findBranchByName(db, testProjectId, 'find-by-name');

      expect(found).toBeDefined();
      expect(found!.name).toBe('find-by-name');
    });

    it('returns null when branch does not exist', async () => {
      const found = await findBranchByName(db, testProjectId, 'nonexistent-branch');

      expect(found).toBeNull();
    });
  });

  describe('findBranchById', () => {
    it('returns the branch when it exists', async () => {
      const created = await insertBranch(db, { projectId: testProjectId, name: 'find-by-id' });

      const found = await findBranchById(db, created.branchId);

      expect(found).toBeDefined();
      expect(found!.branchId).toBe(created.branchId);
      expect(found!.name).toBe('find-by-id');
    });

    it('returns null when branch does not exist', async () => {
      const found = await findBranchById(db, 'branch_nonexistent');

      expect(found).toBeNull();
    });
  });

  describe('findBranchesByProject', () => {
    it('returns branches for a project', async () => {
      const newProject = await insertProject(
        db,
        testData.project({ name: 'List Branches Project' })
      );

      await insertBranch(db, { projectId: newProject.projectId, name: 'branch-a' });
      await insertBranch(db, { projectId: newProject.projectId, name: 'branch-b' });

      const results = await findBranchesByProject(db, { projectId: newProject.projectId });

      expect(results).toHaveLength(2);
      expect(results.every((b) => b.projectId === newProject.projectId)).toBe(true);
    });

    it('returns empty array for project with no branches', async () => {
      const emptyProject = await insertProject(db, testData.project({ name: 'No Branches' }));

      const results = await findBranchesByProject(db, { projectId: emptyProject.projectId });

      expect(results).toHaveLength(0);
    });

    it('respects limit option', async () => {
      const results = await findBranchesByProject(db, { projectId: testProjectId, limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('findCurrentBranch', () => {
    it('returns the current branch', async () => {
      const newProject = await insertProject(
        db,
        testData.project({ name: 'Current Branch Project' })
      );
      const first = await insertBranch(db, { projectId: newProject.projectId, name: 'main' });

      const current = await findCurrentBranch(db, newProject.projectId);

      expect(current).toBeDefined();
      expect(current!.branchId).toBe(first.branchId);
      expect(current!.isCurrent).toBe(1);
    });

    it('returns null for project with no branches', async () => {
      const emptyProject = await insertProject(db, testData.project({ name: 'No Current' }));

      const current = await findCurrentBranch(db, emptyProject.projectId);

      expect(current).toBeNull();
    });
  });

  describe('switchBranch', () => {
    it('switches current branch to target', async () => {
      const newProject = await insertProject(
        db,
        testData.project({ name: 'Switch Branch Project' })
      );
      await insertBranch(db, { projectId: newProject.projectId, name: 'main' });
      await insertBranch(db, { projectId: newProject.projectId, name: 'feature' });

      const switched = await switchBranch(db, newProject.projectId, 'feature');

      expect(switched).toBeDefined();
      expect(switched!.name).toBe('feature');
      expect(switched!.isCurrent).toBe(1);

      // Verify old branch is no longer current
      const old = await findBranchByName(db, newProject.projectId, 'main');
      expect(old!.isCurrent).toBe(0);
    });

    it('returns null when target branch does not exist', async () => {
      const result = await switchBranch(db, testProjectId, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateBranchHead', () => {
    it('updates branch head commit hash', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Head Update Project' }));
      await insertBranch(db, { projectId: newProject.projectId, name: 'main' });

      const commitHash = 'sha256:abc123';
      const updated = await updateBranchHead(db, newProject.projectId, 'main', commitHash);

      expect(updated).toBeDefined();
      expect(updated!.headCommitHash).toBe(commitHash);
    });

    it('returns null when branch does not exist', async () => {
      const result = await updateBranchHead(db, testProjectId, 'nonexistent', 'sha256:xyz');

      expect(result).toBeNull();
    });
  });

  describe('deleteBranch', () => {
    it('deletes a non-current branch', async () => {
      const newProject = await insertProject(
        db,
        testData.project({ name: 'Delete Branch Project' })
      );
      await insertBranch(db, { projectId: newProject.projectId, name: 'main' });
      await insertBranch(db, { projectId: newProject.projectId, name: 'to-delete' });

      const deleted = await deleteBranch(db, newProject.projectId, 'to-delete');

      expect(deleted).toBe(true);

      const found = await findBranchByName(db, newProject.projectId, 'to-delete');
      expect(found).toBeNull();
    });

    it('refuses to delete current branch', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'No Delete Current' }));
      await insertBranch(db, { projectId: newProject.projectId, name: 'main' });

      const deleted = await deleteBranch(db, newProject.projectId, 'main');

      expect(deleted).toBe(false);
    });

    it('returns false when branch does not exist', async () => {
      const deleted = await deleteBranch(db, testProjectId, 'nonexistent');

      expect(deleted).toBe(false);
    });
  });

  describe('ensureMainBranch', () => {
    it('creates main branch if it does not exist', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Ensure Main Project' }));

      const main = await ensureMainBranch(db, newProject.projectId);

      expect(main).toBeDefined();
      expect(main.name).toBe('main');
    });

    it('returns existing main branch if it exists', async () => {
      const newProject = await insertProject(
        db,
        testData.project({ name: 'Existing Main Project' })
      );
      const created = await insertBranch(db, { projectId: newProject.projectId, name: 'main' });

      const main = await ensureMainBranch(db, newProject.projectId);

      expect(main.branchId).toBe(created.branchId);
    });
  });
});
