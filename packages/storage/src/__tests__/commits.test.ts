/**
 * Commits Storage Tests
 *
 * Tests all commit operations and verifies database effects.
 * Commits form DAGs with parent references and are branch-specific.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDB, testData } from './setup';
import { insertProject } from '../queries/projects';
import { insertBranch, findBranchByName } from '../queries/branches';
import {
  insertCommit,
  findCommitByHash,
  findCommitsByProject,
  findCommitParents,
  findCommitHistory,
  updateCommitPosition,
  findCommonAncestor,
  CommitError,
} from '../queries/commits';
import { commits } from '../schema';
import type { AnyDB } from '../adapters';
import type { PGlite } from '@electric-sql/pglite';

describe('Commits Storage', () => {
  let db: AnyDB;
  let client: PGlite;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    client = setup.client;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(db, testData.project({ name: 'Commit Test Project' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('insertCommit', () => {
    it('creates a commit with generated hash', async () => {
      const input = {
        projectId: testProjectId,
        message: 'Initial commit',
        facetSnapshot: [{ type: 'keyword', value: 'test' }],
      };

      const result = await insertCommit(db, input);

      expect(result).toBeDefined();
      expect(result.commitHash).toMatch(/^sha256:[a-f0-9]+$/);
      expect(result.message).toBe('Initial commit');
      expect(result.branch).toBe('main');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('stores the commit in the database', async () => {
      const input = {
        projectId: testProjectId,
        message: 'Stored commit',
        facetSnapshot: [],
      };

      const result = await insertCommit(db, input);

      // Verify database effect
      const rows = await db
        .select()
        .from(commits)
        .where(eq(commits.commitHash, result.commitHash));

      expect(rows).toHaveLength(1);
      expect(rows[0].message).toBe('Stored commit');
      expect(rows[0].projectId).toBe(testProjectId);
    });

    it('auto-creates main branch if targeting main on new project', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Auto Main Project' }));

      const commit = await insertCommit(db, {
        projectId: newProject.projectId,
        facetSnapshot: [],
      });

      expect(commit.branch).toBe('main');

      // Verify main branch was created
      const main = await findBranchByName(db, newProject.projectId, 'main');
      expect(main).toBeDefined();
    });

    it('throws error when targeting non-existent non-main branch', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'No Branch Project' }));

      await expect(
        insertCommit(db, {
          projectId: newProject.projectId,
          branch: 'nonexistent',
          facetSnapshot: [],
        })
      ).rejects.toThrow(CommitError);
    });

    it('first commit has empty parent array', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'First Commit Project' }));

      const commit = await insertCommit(db, {
        projectId: newProject.projectId,
        facetSnapshot: [],
      });

      const parents = JSON.parse(commit.parentsJson);
      expect(parents).toEqual([]);
    });

    it('subsequent commits reference parent', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Chain Commit Project' }));

      const c1 = await insertCommit(db, {
        projectId: newProject.projectId,
        message: 'First',
        facetSnapshot: [],
      });

      const c2 = await insertCommit(db, {
        projectId: newProject.projectId,
        message: 'Second',
        facetSnapshot: [],
      });

      const parents = JSON.parse(c2.parentsJson);
      expect(parents).toEqual([c1.commitHash]);
    });

    it('updates branch head after commit', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Head Update Commit' }));

      const commit = await insertCommit(db, {
        projectId: newProject.projectId,
        facetSnapshot: [],
      });

      const branch = await findBranchByName(db, newProject.projectId, 'main');
      expect(branch!.headCommitHash).toBe(commit.commitHash);
    });

    it('stores facet snapshot as JSON', async () => {
      const facets = [
        { type: 'keyword', value: 'test' },
        { type: 'entity', value: 'user' },
      ];

      const commit = await insertCommit(db, {
        projectId: testProjectId,
        facetSnapshot: facets,
      });

      const stored = JSON.parse(commit.facetSnapshotJson);
      expect(stored).toEqual(facets);
    });

    it('stores position when provided', async () => {
      const commit = await insertCommit(db, {
        projectId: testProjectId,
        facetSnapshot: [],
        positionX: 100,
        positionY: 200,
      });

      expect(commit.positionX).toBe(100);
      expect(commit.positionY).toBe(200);
    });

    it('supports merge parents', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Merge Parents Project' }));
      await insertBranch(db, { projectId: newProject.projectId, name: 'main' });
      await insertBranch(db, { projectId: newProject.projectId, name: 'feature' });

      const mainCommit = await insertCommit(db, {
        projectId: newProject.projectId,
        branch: 'main',
        message: 'Main commit',
        facetSnapshot: [],
      });

      const featureCommit = await insertCommit(db, {
        projectId: newProject.projectId,
        branch: 'feature',
        message: 'Feature commit',
        facetSnapshot: [],
      });

      const mergeCommit = await insertCommit(db, {
        projectId: newProject.projectId,
        branch: 'main',
        message: 'Merge feature',
        facetSnapshot: [],
        mergeParents: [mainCommit.commitHash, featureCommit.commitHash],
      });

      const parents = JSON.parse(mergeCommit.parentsJson);
      expect(parents).toHaveLength(2);
      expect(parents).toContain(mainCommit.commitHash);
      expect(parents).toContain(featureCommit.commitHash);
    });
  });

  describe('findCommitByHash', () => {
    it('returns the commit when it exists', async () => {
      const created = await insertCommit(db, {
        projectId: testProjectId,
        message: 'Find me',
        facetSnapshot: [],
      });

      const found = await findCommitByHash(db, created.commitHash);

      expect(found).toBeDefined();
      expect(found!.commitHash).toBe(created.commitHash);
      expect(found!.message).toBe('Find me');
    });

    it('returns null when commit does not exist', async () => {
      const found = await findCommitByHash(db, 'sha256:nonexistent');

      expect(found).toBeNull();
    });
  });

  describe('findCommitsByProject', () => {
    it('returns commits for a project', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'List Commits Project' }));

      await insertCommit(db, { projectId: newProject.projectId, facetSnapshot: [] });
      await insertCommit(db, { projectId: newProject.projectId, facetSnapshot: [] });

      const results = await findCommitsByProject(db, { projectId: newProject.projectId });

      expect(results).toHaveLength(2);
      expect(results.every((c) => c.projectId === newProject.projectId)).toBe(true);
    });

    it('filters by branch', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Filter Branch Project' }));
      await insertBranch(db, { projectId: newProject.projectId, name: 'main' });
      await insertBranch(db, { projectId: newProject.projectId, name: 'feature' });

      await insertCommit(db, { projectId: newProject.projectId, branch: 'main', facetSnapshot: [] });
      await insertCommit(db, { projectId: newProject.projectId, branch: 'feature', facetSnapshot: [] });

      const mainResults = await findCommitsByProject(db, { projectId: newProject.projectId, branch: 'main' });
      const featureResults = await findCommitsByProject(db, { projectId: newProject.projectId, branch: 'feature' });

      expect(mainResults).toHaveLength(1);
      expect(mainResults[0].branch).toBe('main');
      expect(featureResults).toHaveLength(1);
      expect(featureResults[0].branch).toBe('feature');
    });

    it('respects limit option', async () => {
      const results = await findCommitsByProject(db, { projectId: testProjectId, limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('findCommitParents', () => {
    it('returns parent commits', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Parents Project' }));

      const c1 = await insertCommit(db, { projectId: newProject.projectId, facetSnapshot: [] });
      const c2 = await insertCommit(db, { projectId: newProject.projectId, facetSnapshot: [] });

      const parents = await findCommitParents(db, c2.commitHash);

      expect(parents).toHaveLength(1);
      expect(parents[0].commitHash).toBe(c1.commitHash);
    });

    it('returns empty array for first commit', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'No Parents Project' }));

      const commit = await insertCommit(db, { projectId: newProject.projectId, facetSnapshot: [] });

      const parents = await findCommitParents(db, commit.commitHash);

      expect(parents).toHaveLength(0);
    });
  });

  describe('findCommitHistory', () => {
    it('returns commit history via BFS', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'History Project' }));

      const c1 = await insertCommit(db, { projectId: newProject.projectId, message: 'C1', facetSnapshot: [] });
      const c2 = await insertCommit(db, { projectId: newProject.projectId, message: 'C2', facetSnapshot: [] });
      const c3 = await insertCommit(db, { projectId: newProject.projectId, message: 'C3', facetSnapshot: [] });

      const history = await findCommitHistory(db, c3.commitHash);

      expect(history).toHaveLength(3);
      expect(history[0].commitHash).toBe(c3.commitHash); // Starting point
    });

    it('respects limit option', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'History Limit Project' }));

      await insertCommit(db, { projectId: newProject.projectId, facetSnapshot: [] });
      await insertCommit(db, { projectId: newProject.projectId, facetSnapshot: [] });
      const c3 = await insertCommit(db, { projectId: newProject.projectId, facetSnapshot: [] });

      const history = await findCommitHistory(db, c3.commitHash, 2);

      expect(history.length).toBeLessThanOrEqual(2);
    });
  });

  describe('updateCommitPosition', () => {
    it('updates commit position', async () => {
      const commit = await insertCommit(db, { projectId: testProjectId, facetSnapshot: [] });

      const updated = await updateCommitPosition(db, commit.commitHash, { x: 50, y: 75 });

      expect(updated).toBeDefined();
      expect(updated!.positionX).toBe(50);
      expect(updated!.positionY).toBe(75);
    });

    it('updates only x when only x provided', async () => {
      const commit = await insertCommit(db, { projectId: testProjectId, facetSnapshot: [], positionX: 10, positionY: 20 });

      const updated = await updateCommitPosition(db, commit.commitHash, { x: 100 });

      expect(updated!.positionX).toBe(100);
      expect(updated!.positionY).toBe(20); // Unchanged
    });

    it('returns null when commit does not exist', async () => {
      const result = await updateCommitPosition(db, 'sha256:nonexistent', { x: 0 });

      expect(result).toBeNull();
    });
  });

  describe('findCommonAncestor', () => {
    it('finds common ancestor of two commits', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Ancestor Project' }));
      await insertBranch(db, { projectId: newProject.projectId, name: 'main' });
      await insertBranch(db, { projectId: newProject.projectId, name: 'feature' });

      // Create common ancestor
      const ancestor = await insertCommit(db, {
        projectId: newProject.projectId,
        branch: 'main',
        message: 'Common ancestor',
        facetSnapshot: [],
      });

      // Create divergent commits
      const main2 = await insertCommit(db, {
        projectId: newProject.projectId,
        branch: 'main',
        message: 'Main2',
        facetSnapshot: [],
      });

      // Switch to feature and commit from ancestor
      await insertCommit(db, {
        projectId: newProject.projectId,
        branch: 'feature',
        message: 'Feature1',
        facetSnapshot: [],
        mergeParents: [ancestor.commitHash],
      });
      const feature2 = await insertCommit(db, {
        projectId: newProject.projectId,
        branch: 'feature',
        message: 'Feature2',
        facetSnapshot: [],
      });

      const found = await findCommonAncestor(db, main2.commitHash, feature2.commitHash);

      expect(found).toBeDefined();
      expect(found!.commitHash).toBe(ancestor.commitHash);
    });

    it('returns null when no common ancestor', async () => {
      const proj1 = await insertProject(db, testData.project({ name: 'No Ancestor 1' }));
      const proj2 = await insertProject(db, testData.project({ name: 'No Ancestor 2' }));

      const c1 = await insertCommit(db, { projectId: proj1.projectId, facetSnapshot: [] });
      const c2 = await insertCommit(db, { projectId: proj2.projectId, facetSnapshot: [] });

      const found = await findCommonAncestor(db, c1.commitHash, c2.commitHash);

      expect(found).toBeNull();
    });
  });
});
