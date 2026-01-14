/**
 * Commits V3 Storage Tests
 *
 * Tests all commit v3 operations and verifies database effects.
 * V3 commits use JSONB for author and content fields.
 */

import type { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  createCommitV3,
  deleteCommitV3,
  getCommitV3,
  getCommitV3Parents,
  getCommitsV3ByHashes,
  listCommitsV3,
  ParentNotFoundError,
  updateCommitV3Position,
} from '../queries/commits-v3';
import { insertProject } from '../queries/projects';
import { commitsV3 } from '../schema';
import { createTestDB, testData } from './setup';

describe('Commits V3 Storage', () => {
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
    const project = await insertProject(db, testData.project({ name: 'Commit V3 Test Project' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('createCommitV3', () => {
    it('creates a commit with all required fields', async () => {
      const input = {
        hash: 'sha256:test-hash-001',
        author: { name: 'Test Author' },
        committedAt: new Date('2024-01-15T10:00:00Z'),
        content: {
          sentences: [{ text: 'Hello world', startChar: 0, endChar: 11 }],
        },
        projectId: testProjectId,
        message: 'Initial commit',
      };

      const result = await createCommitV3(db, input);

      expect(result).toBeDefined();
      expect(result.hash).toBe('sha256:test-hash-001');
      expect(result.schema).toBe('commit/v3');
      expect(result.parents).toEqual([]);
      expect(result.author).toEqual({ name: 'Test Author' });
      expect(result.committedAt).toBe('2024-01-15T10:00:00.000Z');
      expect(result.content.sentences).toHaveLength(1);
      expect(result.projectId).toBe(testProjectId);
      expect(result.message).toBe('Initial commit');
    });

    it('stores the commit in the database', async () => {
      const input = {
        hash: 'sha256:test-hash-002',
        author: { name: 'Stored Author' },
        committedAt: new Date('2024-01-15T11:00:00Z'),
        content: { sentences: [] },
        projectId: testProjectId,
      };

      const result = await createCommitV3(db, input);

      // Verify database effect
      const rows = await db.select().from(commitsV3).where(eq(commitsV3.hash, result.hash));

      expect(rows).toHaveLength(1);
      expect(rows[0].hash).toBe('sha256:test-hash-002');
      expect(rows[0].author).toEqual({ name: 'Stored Author' });
    });

    it('stores author with optional fields', async () => {
      const input = {
        hash: 'sha256:test-hash-003',
        author: {
          name: 'Full Author',
          identity: 'user@example.com',
          verification: 'oauth:google',
        },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
      };

      const result = await createCommitV3(db, input);

      expect(result.author).toEqual({
        name: 'Full Author',
        identity: 'user@example.com',
        verification: 'oauth:google',
      });
    });

    it('stores content with constraints', async () => {
      const input = {
        hash: 'sha256:test-hash-004',
        author: { name: 'Constraint Author' },
        committedAt: new Date(),
        content: {
          sentences: [{ text: 'Budget is $5000', startChar: 0, endChar: 15 }],
          constraints: [{ type: 'must_have' as const, value: '5000' }],
        },
        projectId: testProjectId,
      };

      const result = await createCommitV3(db, input);

      expect(result.content.sentences).toHaveLength(1);
      expect(result.content.constraints).toHaveLength(1);
      expect(result.content.constraints![0]).toEqual({ type: 'must_have', value: '5000' });
    });

    it('stores parents array', async () => {
      const parent = await createCommitV3(db, {
        hash: 'sha256:parent-hash-001',
        author: { name: 'Parent Author' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
      });

      const child = await createCommitV3(db, {
        hash: 'sha256:child-hash-001',
        parents: [parent.hash],
        author: { name: 'Child Author' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
      });

      expect(child.parents).toEqual([parent.hash]);
    });

    it('stores position when provided', async () => {
      const input = {
        hash: 'sha256:test-hash-005',
        author: { name: 'Position Author' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
        position: { x: 100, y: 200 },
      };

      const result = await createCommitV3(db, input);

      expect(result.position).toEqual({ x: 100, y: 200 });
    });

    it('stores branch when provided', async () => {
      const input = {
        hash: 'sha256:test-hash-006',
        author: { name: 'Branch Author' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
        branch: 'feature/new-ui',
      };

      const result = await createCommitV3(db, input);

      expect(result.branch).toBe('feature/new-ui');
    });

    it('throws error on duplicate hash', async () => {
      const input = {
        hash: 'sha256:duplicate-hash-001',
        author: { name: 'First Author' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
      };

      await createCommitV3(db, input);

      // Second insert with same hash should fail
      await expect(
        createCommitV3(db, {
          ...input,
          author: { name: 'Second Author' },
        })
      ).rejects.toThrow();
    });

    it('allows custom schema version', async () => {
      const input = {
        hash: 'sha256:custom-schema-001',
        schema: 'commit/v3.1',
        author: { name: 'Schema Author' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
      };

      const result = await createCommitV3(db, input);

      expect(result.schema).toBe('commit/v3.1');
    });
  });

  describe('getCommitV3', () => {
    it('returns the commit when it exists', async () => {
      const created = await createCommitV3(db, {
        hash: 'sha256:get-hash-001',
        author: { name: 'Get Author' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
        message: 'Find me',
      });

      const found = await getCommitV3(db, created.hash);

      expect(found).toBeDefined();
      expect(found!.hash).toBe(created.hash);
      expect(found!.message).toBe('Find me');
    });

    it('returns null when commit does not exist', async () => {
      const found = await getCommitV3(db, 'sha256:nonexistent');

      expect(found).toBeNull();
    });
  });

  describe('listCommitsV3', () => {
    it('returns commits for a project', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'List V3 Project' }));

      await createCommitV3(db, {
        hash: 'sha256:list-hash-001',
        author: { name: 'List Author 1' },
        committedAt: new Date('2024-01-15T10:00:00Z'),
        content: { sentences: [] },
        projectId: newProject.projectId,
      });

      await createCommitV3(db, {
        hash: 'sha256:list-hash-002',
        author: { name: 'List Author 2' },
        committedAt: new Date('2024-01-15T11:00:00Z'),
        content: { sentences: [] },
        projectId: newProject.projectId,
      });

      const results = await listCommitsV3(db, { projectId: newProject.projectId });

      expect(results).toHaveLength(2);
      expect(results.every((c) => c.projectId === newProject.projectId)).toBe(true);
    });

    it('orders by committedAt descending', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Order V3 Project' }));

      await createCommitV3(db, {
        hash: 'sha256:order-hash-001',
        author: { name: 'Order Author' },
        committedAt: new Date('2024-01-15T10:00:00Z'),
        content: { sentences: [] },
        projectId: newProject.projectId,
        message: 'First',
      });

      await createCommitV3(db, {
        hash: 'sha256:order-hash-002',
        author: { name: 'Order Author' },
        committedAt: new Date('2024-01-15T12:00:00Z'),
        content: { sentences: [] },
        projectId: newProject.projectId,
        message: 'Second',
      });

      const results = await listCommitsV3(db, { projectId: newProject.projectId });

      expect(results[0].message).toBe('Second'); // Newer first
      expect(results[1].message).toBe('First');
    });

    it('filters by branch at SQL level (correct pagination)', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Branch Filter SQL Project' }));

      // Create interleaved commits on main and feature branches
      for (let i = 0; i < 5; i++) {
        await createCommitV3(db, {
          hash: `sha256:branch-sql-main-${i}`,
          author: { name: 'Branch Author' },
          committedAt: new Date(Date.now() + i * 1000),
          content: { sentences: [] },
          projectId: newProject.projectId,
          branch: 'main',
        });
        await createCommitV3(db, {
          hash: `sha256:branch-sql-feature-${i}`,
          author: { name: 'Branch Author' },
          committedAt: new Date(Date.now() + i * 1000 + 500),
          content: { sentences: [] },
          projectId: newProject.projectId,
          branch: 'feature',
        });
      }

      // With limit=3 and branch filter, should get exactly 3 main commits
      const mainResults = await listCommitsV3(db, {
        projectId: newProject.projectId,
        branch: 'main',
        limit: 3,
      });

      expect(mainResults).toHaveLength(3);
      expect(mainResults.every((c) => c.branch === 'main')).toBe(true);
    });

    it('respects limit option', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Limit V3 Project' }));

      for (let i = 0; i < 5; i++) {
        await createCommitV3(db, {
          hash: `sha256:limit-hash-${i}`,
          author: { name: 'Limit Author' },
          committedAt: new Date(Date.now() + i * 1000),
          content: { sentences: [] },
          projectId: newProject.projectId,
        });
      }

      const results = await listCommitsV3(db, { projectId: newProject.projectId, limit: 2 });

      expect(results).toHaveLength(2);
    });

    it('respects offset option for pagination', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Offset V3 Project' }));

      for (let i = 0; i < 5; i++) {
        await createCommitV3(db, {
          hash: `sha256:offset-hash-${i}`,
          author: { name: 'Offset Author' },
          committedAt: new Date(new Date('2024-01-15T10:00:00Z').getTime() + i * 60000),
          content: { sentences: [] },
          projectId: newProject.projectId,
          message: `Commit ${i}`,
        });
      }

      // Get page 2 (offset 2, limit 2)
      const page2 = await listCommitsV3(db, {
        projectId: newProject.projectId,
        limit: 2,
        offset: 2,
      });

      expect(page2).toHaveLength(2);
      // Should be commits 2 and 1 (descending order, offset 2)
      expect(page2[0].message).toBe('Commit 2');
      expect(page2[1].message).toBe('Commit 1');
    });
  });

  describe('updateCommitV3Position', () => {
    it('updates commit position', async () => {
      const commit = await createCommitV3(db, {
        hash: 'sha256:update-pos-001',
        author: { name: 'Update Author' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
      });

      const updated = await updateCommitV3Position(db, commit.hash, { x: 50, y: 75 });

      expect(updated).toBeDefined();
      expect(updated!.position).toEqual({ x: 50, y: 75 });
    });

    it('updates only x when only x provided (preserves y)', async () => {
      const commit = await createCommitV3(db, {
        hash: 'sha256:update-pos-002',
        author: { name: 'Update Author' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
        position: { x: 10, y: 20 },
      });

      const updated = await updateCommitV3Position(db, commit.hash, { x: 100 });

      expect(updated!.position!.x).toBe(100);
      expect(updated!.position!.y).toBe(20); // Preserved
    });

    it('updates only y when only y provided (preserves x)', async () => {
      const commit = await createCommitV3(db, {
        hash: 'sha256:update-pos-003',
        author: { name: 'Update Author' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
        position: { x: 10, y: 20 },
      });

      const updated = await updateCommitV3Position(db, commit.hash, { y: 200 });

      expect(updated!.position!.x).toBe(10); // Preserved
      expect(updated!.position!.y).toBe(200);
    });

    it('returns undefined position when only one coordinate is set', async () => {
      const commit = await createCommitV3(db, {
        hash: 'sha256:update-pos-004',
        author: { name: 'Update Author' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
        // No initial position
      });

      const updated = await updateCommitV3Position(db, commit.hash, { x: 50 });

      // Position only returned when BOTH x and y are set
      expect(updated!.position).toBeUndefined();
    });

    it('returns position when both coordinates are set via separate updates', async () => {
      const commit = await createCommitV3(db, {
        hash: 'sha256:update-pos-005',
        author: { name: 'Update Author' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
      });

      // Set x first
      await updateCommitV3Position(db, commit.hash, { x: 50 });
      // Then set y
      const updated = await updateCommitV3Position(db, commit.hash, { y: 75 });

      // Now both are set, so position is returned
      expect(updated!.position).toEqual({ x: 50, y: 75 });
    });

    it('returns null when commit does not exist', async () => {
      const result = await updateCommitV3Position(db, 'sha256:nonexistent', { x: 0 });

      expect(result).toBeNull();
    });
  });

  describe('deleteCommitV3', () => {
    it('deletes a commit', async () => {
      const commit = await createCommitV3(db, {
        hash: 'sha256:delete-hash-001',
        author: { name: 'Delete Author' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
      });

      const deleted = await deleteCommitV3(db, commit.hash);
      expect(deleted).toBe(true);

      const found = await getCommitV3(db, commit.hash);
      expect(found).toBeNull();
    });

    it('returns false when commit does not exist', async () => {
      const deleted = await deleteCommitV3(db, 'sha256:nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('getCommitV3Parents', () => {
    it('returns parent commits', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Parents V3 Project' }));

      const parent = await createCommitV3(db, {
        hash: 'sha256:parent-v3-001',
        author: { name: 'Parent' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: newProject.projectId,
      });

      const child = await createCommitV3(db, {
        hash: 'sha256:child-v3-001',
        parents: [parent.hash],
        author: { name: 'Child' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: newProject.projectId,
      });

      const parents = await getCommitV3Parents(db, child.hash);

      expect(parents).toHaveLength(1);
      expect(parents[0].hash).toBe(parent.hash);
    });

    it('returns empty array for first commit', async () => {
      const commit = await createCommitV3(db, {
        hash: 'sha256:root-v3-001',
        author: { name: 'Root' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
      });

      const parents = await getCommitV3Parents(db, commit.hash);

      expect(parents).toHaveLength(0);
    });

    it('returns multiple parents for merge commits in correct order', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Merge V3 Project' }));

      const parent1 = await createCommitV3(db, {
        hash: 'sha256:merge-parent-1',
        author: { name: 'Parent 1' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: newProject.projectId,
      });

      const parent2 = await createCommitV3(db, {
        hash: 'sha256:merge-parent-2',
        author: { name: 'Parent 2' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: newProject.projectId,
      });

      const mergeCommit = await createCommitV3(db, {
        hash: 'sha256:merge-commit-001',
        parents: [parent1.hash, parent2.hash],
        author: { name: 'Merger' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: newProject.projectId,
      });

      const parents = await getCommitV3Parents(db, mergeCommit.hash);

      expect(parents).toHaveLength(2);
      // Should preserve order from parents array
      expect(parents[0].hash).toBe(parent1.hash);
      expect(parents[1].hash).toBe(parent2.hash);
    });

    it('handles missing parents gracefully when reading (dangling references)', async () => {
      // Use strictParents: false to allow import mode
      const commit = await createCommitV3(db, {
        hash: 'sha256:dangling-ref-001',
        parents: ['sha256:nonexistent-parent'],
        author: { name: 'Orphan' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
      }, { strictParents: false });

      const parents = await getCommitV3Parents(db, commit.hash);

      // Should return empty array, not throw
      expect(parents).toHaveLength(0);
    });
  });

  describe('strictParents validation', () => {
    it('throws ParentNotFoundError when parent does not exist (default strict mode)', async () => {
      await expect(
        createCommitV3(db, {
          hash: 'sha256:strict-fail-001',
          parents: ['sha256:nonexistent-parent'],
          author: { name: 'Orphan' },
          committedAt: new Date(),
          content: { sentences: [] },
          projectId: testProjectId,
        })
      ).rejects.toThrow(ParentNotFoundError);
    });

    it('includes missing parent hashes in error', async () => {
      try {
        await createCommitV3(db, {
          hash: 'sha256:strict-fail-002',
          parents: ['sha256:missing-1', 'sha256:missing-2'],
          author: { name: 'Orphan' },
          committedAt: new Date(),
          content: { sentences: [] },
          projectId: testProjectId,
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ParentNotFoundError);
        const err = e as ParentNotFoundError;
        expect(err.missingParents).toContain('sha256:missing-1');
        expect(err.missingParents).toContain('sha256:missing-2');
        expect(err.allParents).toEqual(['sha256:missing-1', 'sha256:missing-2']);
      }
    });

    it('allows missing parents with strictParents: false (import mode)', async () => {
      const commit = await createCommitV3(db, {
        hash: 'sha256:import-mode-001',
        parents: ['sha256:future-parent'],
        author: { name: 'Importer' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
      }, { strictParents: false });

      expect(commit.parents).toEqual(['sha256:future-parent']);
    });

    it('succeeds when all parents exist (strict mode)', async () => {
      const parent = await createCommitV3(db, {
        hash: 'sha256:strict-parent-001',
        author: { name: 'Parent' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
      });

      const child = await createCommitV3(db, {
        hash: 'sha256:strict-child-001',
        parents: [parent.hash],
        author: { name: 'Child' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
      }); // strictParents: true by default

      expect(child.parents).toEqual([parent.hash]);
    });

    it('validates partial parents (some exist, some missing)', async () => {
      const existingParent = await createCommitV3(db, {
        hash: 'sha256:partial-parent-001',
        author: { name: 'Existing' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
      });

      try {
        await createCommitV3(db, {
          hash: 'sha256:partial-child-001',
          parents: [existingParent.hash, 'sha256:missing-parent'],
          author: { name: 'Child' },
          committedAt: new Date(),
          content: { sentences: [] },
          projectId: testProjectId,
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ParentNotFoundError);
        const err = e as ParentNotFoundError;
        expect(err.missingParents).toEqual(['sha256:missing-parent']);
        expect(err.missingParents).not.toContain(existingParent.hash);
      }
    });
  });

  describe('getCommitsV3ByHashes', () => {
    it('returns multiple commits in single query', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Batch V3 Project' }));

      const commit1 = await createCommitV3(db, {
        hash: 'sha256:batch-hash-1',
        author: { name: 'Batch Author 1' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: newProject.projectId,
      });

      const commit2 = await createCommitV3(db, {
        hash: 'sha256:batch-hash-2',
        author: { name: 'Batch Author 2' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: newProject.projectId,
      });

      const results = await getCommitsV3ByHashes(db, [commit1.hash, commit2.hash]);

      expect(results).toHaveLength(2);
      const hashes = results.map((c) => c.hash);
      expect(hashes).toContain(commit1.hash);
      expect(hashes).toContain(commit2.hash);
    });

    it('returns empty array for empty input', async () => {
      const results = await getCommitsV3ByHashes(db, []);
      expect(results).toHaveLength(0);
    });

    it('returns only existing commits when some hashes are invalid', async () => {
      const commit = await createCommitV3(db, {
        hash: 'sha256:partial-batch-001',
        author: { name: 'Partial Author' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: testProjectId,
      });

      const results = await getCommitsV3ByHashes(db, [
        commit.hash,
        'sha256:nonexistent-1',
        'sha256:nonexistent-2',
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].hash).toBe(commit.hash);
    });

    it('preserves input order', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Order Batch Project' }));

      const commit1 = await createCommitV3(db, {
        hash: 'sha256:order-batch-1',
        author: { name: 'Author 1' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: newProject.projectId,
      });

      const commit2 = await createCommitV3(db, {
        hash: 'sha256:order-batch-2',
        author: { name: 'Author 2' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: newProject.projectId,
      });

      const commit3 = await createCommitV3(db, {
        hash: 'sha256:order-batch-3',
        author: { name: 'Author 3' },
        committedAt: new Date(),
        content: { sentences: [] },
        projectId: newProject.projectId,
      });

      // Request in specific order: 3, 1, 2
      const results = await getCommitsV3ByHashes(db, [
        commit3.hash,
        commit1.hash,
        commit2.hash,
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].hash).toBe(commit3.hash);
      expect(results[1].hash).toBe(commit1.hash);
      expect(results[2].hash).toBe(commit2.hash);
    });
  });

  describe('output format', () => {
    it('uses camelCase for all fields', async () => {
      const commit = await createCommitV3(db, {
        hash: 'sha256:camelcase-test-001',
        author: { name: 'CamelCase Author' },
        committedAt: new Date('2024-01-15T10:00:00Z'),
        content: { sentences: [] },
        projectId: testProjectId,
      });

      // Verify camelCase keys exist
      expect(commit).toHaveProperty('committedAt');
      expect(commit).toHaveProperty('projectId');
      expect(commit).toHaveProperty('createdAt');
      expect(commit).toHaveProperty('updatedAt');

      // Verify snake_case keys don't exist
      expect(commit).not.toHaveProperty('committed_at');
      expect(commit).not.toHaveProperty('project_id');
      expect(commit).not.toHaveProperty('created_at');
      expect(commit).not.toHaveProperty('updated_at');
    });
  });
});
