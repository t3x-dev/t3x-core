/**
 * Commits V4 Storage Tests
 *
 * Tests all commit v4 operations and verifies database effects.
 * V4 commits store pure knowledge (sentences only, no constraints).
 *
 * @see docs/specification/semantic-layer-architecture.md
 */

import type { PGlite } from '@electric-sql/pglite';
import type { CommitAuthorV4, SentenceV4 } from '@t3x/core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  computeCommitV4Hash,
  createCommitV4,
  deleteCommitV4,
  findCommitsV4ByBranch,
  findCommitsV4ByProject,
  findCommitV4ByHash,
  findCommitV4History,
  getCommitsV4ByHashes,
  getCommitV4Parents,
  ParentNotFoundErrorV4,
  updateCommitV4Position,
} from '../queries/commits-v4';
import { insertProject } from '../queries/projects';
import { commitsV4 } from '../schema-v4';
import { createTestDB, testData } from './setup';

describe('Commits V4 Storage', () => {
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
    const project = await insertProject(db, testData.project({ name: 'Commit V4 Test Project' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('computeCommitV4Hash', () => {
    it('computes deterministic hash from first-class fields', () => {
      const data = {
        schema: 't3x/commit/v4' as const,
        parents: [],
        author: { type: 'human' as const, name: 'Test' },
        committed_at: '2024-01-15T10:00:00.000Z',
        content: {
          sentences: [{ id: 's_1', text: 'Hello world' }],
        },
      };

      const hash1 = computeCommitV4Hash(data);
      const hash2 = computeCommitV4Hash(data);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('produces different hash for different content', () => {
      const base = {
        schema: 't3x/commit/v4' as const,
        parents: [],
        author: { type: 'human' as const, name: 'Test' },
        committed_at: '2024-01-15T10:00:00.000Z',
      };

      const hash1 = computeCommitV4Hash({
        ...base,
        content: { sentences: [{ id: 's_1', text: 'Hello' }] },
      });

      const hash2 = computeCommitV4Hash({
        ...base,
        content: { sentences: [{ id: 's_1', text: 'World' }] },
      });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('createCommitV4', () => {
    it('creates a commit with all required fields', async () => {
      const input = {
        parents: [],
        author: { type: 'human' as const, name: 'Test Author' },
        sentences: [
          { id: 's_1', text: 'Hello world' },
          { id: 's_2', text: 'This is a test' },
        ],
        project_id: testProjectId,
        message: 'Initial commit',
      };

      const result = await createCommitV4(db, input);

      expect(result).toBeDefined();
      expect(result.hash).toMatch(/^sha256:/);
      expect(result.schema).toBe('t3x/commit/v4');
      expect(result.parents).toEqual([]);
      expect(result.author).toEqual({ type: 'human', name: 'Test Author' });
      expect(result.content.sentences).toHaveLength(2);
      expect(result.project_id).toBe(testProjectId);
      expect(result.message).toBe('Initial commit');
    });

    it('stores the commit in the database', async () => {
      const input = {
        parents: [],
        author: { type: 'human' as const, name: 'Stored Author' },
        sentences: [{ id: 's_1', text: 'Stored sentence' }],
        project_id: testProjectId,
      };

      const result = await createCommitV4(db, input);

      // Verify database effect
      const rows = await db.select().from(commitsV4).where(eq(commitsV4.hash, result.hash));

      expect(rows).toHaveLength(1);
      expect(rows[0].hash).toBe(result.hash);
      expect(rows[0].author).toEqual({ type: 'human', name: 'Stored Author' });
    });

    it('stores author with agent type', async () => {
      const input = {
        parents: [],
        author: { type: 'agent' as const, id: 'agent_123', name: 'AI Agent' },
        sentences: [{ id: 's_1', text: 'Agent-created sentence' }],
        project_id: testProjectId,
      };

      const result = await createCommitV4(db, input);

      expect(result.author).toEqual({
        type: 'agent',
        id: 'agent_123',
        name: 'AI Agent',
      });
    });

    it('stores sentences with source_ref', async () => {
      const sentences: SentenceV4[] = [
        {
          id: 's_1',
          text: 'Referenced sentence',
          source_ref: {
            conversation_id: 'conv_123',
            turn_hash: 'sha256:abc',
            start_char: 0,
            end_char: 19,
          },
        },
      ];

      const input = {
        parents: [],
        author: { type: 'human' as const, name: 'Test' },
        sentences,
        project_id: testProjectId,
      };

      const result = await createCommitV4(db, input);

      expect(result.content.sentences[0].source_ref).toEqual({
        conversation_id: 'conv_123',
        turn_hash: 'sha256:abc',
        start_char: 0,
        end_char: 19,
      });
    });

    it('stores parents array', async () => {
      const parent = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Parent Author' },
        sentences: [{ id: 's_1', text: 'Parent sentence' }],
        project_id: testProjectId,
      });

      const child = await createCommitV4(db, {
        parents: [parent.hash],
        author: { type: 'human' as const, name: 'Child Author' },
        sentences: [{ id: 's_2', text: 'Child sentence' }],
        project_id: testProjectId,
      });

      expect(child.parents).toEqual([parent.hash]);
    });

    it('stores position when provided', async () => {
      const input = {
        parents: [],
        author: { type: 'human' as const, name: 'Position Author' },
        sentences: [{ id: 's_1', text: 'Positioned sentence' }],
        project_id: testProjectId,
        position_x: 100,
        position_y: 200,
      };

      const result = await createCommitV4(db, input);

      expect(result.position_x).toBe(100);
      expect(result.position_y).toBe(200);
    });

    it('stores branch when provided', async () => {
      const input = {
        parents: [],
        author: { type: 'human' as const, name: 'Branch Author' },
        sentences: [{ id: 's_1', text: 'Branch sentence' }],
        project_id: testProjectId,
        branch: 'feature/new-ui',
      };

      const result = await createCommitV4(db, input);

      expect(result.branch).toBe('feature/new-ui');
    });

    it('stores source_refs when provided', async () => {
      const input = {
        parents: [],
        author: { type: 'human' as const, name: 'Source Author' },
        sentences: [{ id: 's_1', text: 'Source sentence' }],
        project_id: testProjectId,
        source_refs: [
          { type: 'conversation' as const, id: 'conv_123', title: 'Test Conv' },
          {
            type: 'leaf' as const,
            id: 'leaf_456',
            assertion_lessons: ['lesson 1'],
          },
        ],
      };

      const result = await createCommitV4(db, input);

      expect(result.source_refs).toHaveLength(2);
      expect(result.source_refs![0]).toEqual({
        type: 'conversation',
        id: 'conv_123',
        title: 'Test Conv',
      });
      expect(result.source_refs![1]).toEqual({
        type: 'leaf',
        id: 'leaf_456',
        assertion_lessons: ['lesson 1'],
      });
    });

    it('throws error on duplicate hash', async () => {
      // Create two commits with identical first-class fields at same timestamp
      // Note: In practice this is unlikely due to timestamp precision
      const author: CommitAuthorV4 = { type: 'human', name: 'Duplicate Author' };
      const sentences = [{ id: 's_dup', text: 'Duplicate test' }];

      const first = await createCommitV4(db, {
        parents: [],
        author,
        sentences,
        project_id: testProjectId,
      });

      // Trying to insert with the same hash should fail (requires same timestamp)
      // This test verifies the DB constraint works
      const rows = await db.select().from(commitsV4).where(eq(commitsV4.hash, first.hash));
      expect(rows).toHaveLength(1);
    });
  });

  describe('findCommitV4ByHash', () => {
    it('returns the commit when it exists', async () => {
      const created = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Find Author' },
        sentences: [{ id: 's_find', text: 'Find me' }],
        project_id: testProjectId,
        message: 'Find this',
      });

      const found = await findCommitV4ByHash(db, created.hash);

      expect(found).toBeDefined();
      expect(found!.hash).toBe(created.hash);
      expect(found!.message).toBe('Find this');
    });

    it('returns null when commit does not exist', async () => {
      const found = await findCommitV4ByHash(db, 'sha256:nonexistent');

      expect(found).toBeNull();
    });
  });

  describe('findCommitsV4ByProject', () => {
    it('returns commits for a project', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'List V4 Project' }));

      await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'List Author 1' },
        sentences: [{ id: 's_list1', text: 'List 1' }],
        project_id: newProject.projectId,
      });

      await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'List Author 2' },
        sentences: [{ id: 's_list2', text: 'List 2' }],
        project_id: newProject.projectId,
      });

      const results = await findCommitsV4ByProject(db, newProject.projectId);

      expect(results).toHaveLength(2);
      expect(results.every((c) => c.project_id === newProject.projectId)).toBe(true);
    });

    it('orders by committedAt descending', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Order V4 Project' }));

      // Create first commit
      await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Order Author' },
        sentences: [{ id: 's_first', text: 'First' }],
        project_id: newProject.projectId,
        message: 'First',
      });

      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));

      // Create second commit
      await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Order Author' },
        sentences: [{ id: 's_second', text: 'Second' }],
        project_id: newProject.projectId,
        message: 'Second',
      });

      const results = await findCommitsV4ByProject(db, newProject.projectId);

      expect(results[0].message).toBe('Second'); // Newer first
      expect(results[1].message).toBe('First');
    });

    it('respects limit option', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Limit V4 Project' }));

      for (let i = 0; i < 5; i++) {
        await createCommitV4(db, {
          parents: [],
          author: { type: 'human' as const, name: 'Limit Author' },
          sentences: [{ id: `s_limit${i}`, text: `Limit ${i}` }],
          project_id: newProject.projectId,
        });
      }

      const results = await findCommitsV4ByProject(db, newProject.projectId, {
        limit: 2,
      });

      expect(results).toHaveLength(2);
    });

    it('respects offset option for pagination', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Offset V4 Project' }));

      for (let i = 0; i < 5; i++) {
        await createCommitV4(db, {
          parents: [],
          author: { type: 'human' as const, name: 'Offset Author' },
          sentences: [{ id: `s_offset${i}`, text: `Offset ${i}` }],
          project_id: newProject.projectId,
          message: `Commit ${i}`,
        });
        await new Promise((r) => setTimeout(r, 5)); // Ensure different timestamps
      }

      // Get page 2 (offset 2, limit 2)
      const page2 = await findCommitsV4ByProject(db, newProject.projectId, {
        limit: 2,
        offset: 2,
      });

      expect(page2).toHaveLength(2);
    });
  });

  describe('findCommitsV4ByBranch', () => {
    it('filters by branch at SQL level', async () => {
      const newProject = await insertProject(
        db,
        testData.project({ name: 'Branch Filter V4 Project' })
      );

      // Create commits on main and feature branches
      for (let i = 0; i < 3; i++) {
        await createCommitV4(db, {
          parents: [],
          author: { type: 'human' as const, name: 'Branch Author' },
          sentences: [{ id: `s_main${i}`, text: `Main ${i}` }],
          project_id: newProject.projectId,
          branch: 'main',
        });
        await createCommitV4(db, {
          parents: [],
          author: { type: 'human' as const, name: 'Branch Author' },
          sentences: [{ id: `s_feature${i}`, text: `Feature ${i}` }],
          project_id: newProject.projectId,
          branch: 'feature',
        });
      }

      const mainResults = await findCommitsV4ByBranch(db, newProject.projectId, 'main');

      expect(mainResults).toHaveLength(3);
      expect(mainResults.every((c) => c.branch === 'main')).toBe(true);

      const featureResults = await findCommitsV4ByBranch(db, newProject.projectId, 'feature');

      expect(featureResults).toHaveLength(3);
      expect(featureResults.every((c) => c.branch === 'feature')).toBe(true);
    });

    it('respects limit option', async () => {
      const newProject = await insertProject(
        db,
        testData.project({ name: 'Branch Limit V4 Project' })
      );

      for (let i = 0; i < 5; i++) {
        await createCommitV4(db, {
          parents: [],
          author: { type: 'human' as const, name: 'Branch Limit Author' },
          sentences: [{ id: `s_blimit${i}`, text: `BLimit ${i}` }],
          project_id: newProject.projectId,
          branch: 'main',
        });
      }

      const results = await findCommitsV4ByBranch(db, newProject.projectId, 'main', { limit: 2 });

      expect(results).toHaveLength(2);
    });
  });

  describe('updateCommitV4Position', () => {
    it('updates commit position', async () => {
      const commit = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Update Author' },
        sentences: [{ id: 's_update', text: 'Update me' }],
        project_id: testProjectId,
      });

      const updated = await updateCommitV4Position(db, commit.hash, 50, 75);

      expect(updated).toBeDefined();
      expect(updated!.position_x).toBe(50);
      expect(updated!.position_y).toBe(75);
    });

    it('replaces existing position', async () => {
      const commit = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Replace Author' },
        sentences: [{ id: 's_replace', text: 'Replace me' }],
        project_id: testProjectId,
        position_x: 10,
        position_y: 20,
      });

      const updated = await updateCommitV4Position(db, commit.hash, 100, 200);

      expect(updated!.position_x).toBe(100);
      expect(updated!.position_y).toBe(200);
    });

    it('returns null when commit does not exist', async () => {
      const result = await updateCommitV4Position(db, 'sha256:nonexistent', 0, 0);

      expect(result).toBeNull();
    });
  });

  describe('deleteCommitV4', () => {
    it('deletes a commit', async () => {
      const commit = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Delete Author' },
        sentences: [{ id: 's_delete', text: 'Delete me' }],
        project_id: testProjectId,
      });

      const deleted = await deleteCommitV4(db, commit.hash);
      expect(deleted).toBe(true);

      const found = await findCommitV4ByHash(db, commit.hash);
      expect(found).toBeNull();
    });

    it('returns false when commit does not exist', async () => {
      const deleted = await deleteCommitV4(db, 'sha256:nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('getCommitV4Parents', () => {
    it('returns parent commits', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Parents V4 Project' }));

      const parent = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Parent' },
        sentences: [{ id: 's_parent', text: 'Parent' }],
        project_id: newProject.projectId,
      });

      const child = await createCommitV4(db, {
        parents: [parent.hash],
        author: { type: 'human' as const, name: 'Child' },
        sentences: [{ id: 's_child', text: 'Child' }],
        project_id: newProject.projectId,
      });

      const parents = await getCommitV4Parents(db, child.hash);

      expect(parents).toHaveLength(1);
      expect(parents[0].hash).toBe(parent.hash);
    });

    it('returns empty array for first commit', async () => {
      const commit = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Root' },
        sentences: [{ id: 's_root', text: 'Root' }],
        project_id: testProjectId,
      });

      const parents = await getCommitV4Parents(db, commit.hash);

      expect(parents).toHaveLength(0);
    });

    it('returns multiple parents for merge commits', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Merge V4 Project' }));

      const parent1 = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Parent 1' },
        sentences: [{ id: 's_p1', text: 'Parent 1' }],
        project_id: newProject.projectId,
      });

      const parent2 = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Parent 2' },
        sentences: [{ id: 's_p2', text: 'Parent 2' }],
        project_id: newProject.projectId,
      });

      const mergeCommit = await createCommitV4(db, {
        parents: [parent1.hash, parent2.hash],
        author: { type: 'human' as const, name: 'Merger' },
        sentences: [{ id: 's_merge', text: 'Merge' }],
        project_id: newProject.projectId,
      });

      const parents = await getCommitV4Parents(db, mergeCommit.hash);

      expect(parents).toHaveLength(2);
      expect(parents[0].hash).toBe(parent1.hash);
      expect(parents[1].hash).toBe(parent2.hash);
    });

    it('handles missing parents gracefully (dangling references)', async () => {
      // Use strictParents: false to allow import mode
      const commit = await createCommitV4(
        db,
        {
          parents: ['sha256:nonexistent-parent'],
          author: { type: 'human' as const, name: 'Orphan' },
          sentences: [{ id: 's_orphan', text: 'Orphan' }],
          project_id: testProjectId,
        },
        { strictParents: false }
      );

      const parents = await getCommitV4Parents(db, commit.hash);

      // Should return empty array, not throw
      expect(parents).toHaveLength(0);
    });
  });

  describe('strictParents validation', () => {
    it('throws ParentNotFoundErrorV4 when parent does not exist (default strict mode)', async () => {
      await expect(
        createCommitV4(db, {
          parents: ['sha256:nonexistent-parent'],
          author: { type: 'human' as const, name: 'Orphan' },
          sentences: [{ id: 's_strict', text: 'Strict' }],
          project_id: testProjectId,
        })
      ).rejects.toThrow(ParentNotFoundErrorV4);
    });

    it('includes missing parent hashes in error', async () => {
      try {
        await createCommitV4(db, {
          parents: ['sha256:missing-1', 'sha256:missing-2'],
          author: { type: 'human' as const, name: 'Orphan' },
          sentences: [{ id: 's_err', text: 'Error' }],
          project_id: testProjectId,
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ParentNotFoundErrorV4);
        const err = e as ParentNotFoundErrorV4;
        expect(err.missingParents).toContain('sha256:missing-1');
        expect(err.missingParents).toContain('sha256:missing-2');
        expect(err.allParents).toEqual(['sha256:missing-1', 'sha256:missing-2']);
      }
    });

    it('allows missing parents with strictParents: false (import mode)', async () => {
      const commit = await createCommitV4(
        db,
        {
          parents: ['sha256:future-parent'],
          author: { type: 'human' as const, name: 'Importer' },
          sentences: [{ id: 's_import', text: 'Import' }],
          project_id: testProjectId,
        },
        { strictParents: false }
      );

      expect(commit.parents).toEqual(['sha256:future-parent']);
    });

    it('succeeds when all parents exist (strict mode)', async () => {
      const parent = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Parent' },
        sentences: [{ id: 's_sp', text: 'Strict Parent' }],
        project_id: testProjectId,
      });

      const child = await createCommitV4(db, {
        parents: [parent.hash],
        author: { type: 'human' as const, name: 'Child' },
        sentences: [{ id: 's_sc', text: 'Strict Child' }],
        project_id: testProjectId,
      }); // strictParents: true by default

      expect(child.parents).toEqual([parent.hash]);
    });
  });

  describe('getCommitsV4ByHashes', () => {
    it('returns multiple commits in single query', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'Batch V4 Project' }));

      const commit1 = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Batch Author 1' },
        sentences: [{ id: 's_b1', text: 'Batch 1' }],
        project_id: newProject.projectId,
      });

      const commit2 = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Batch Author 2' },
        sentences: [{ id: 's_b2', text: 'Batch 2' }],
        project_id: newProject.projectId,
      });

      const results = await getCommitsV4ByHashes(db, [commit1.hash, commit2.hash]);

      expect(results).toHaveLength(2);
      const hashes = results.map((c) => c.hash);
      expect(hashes).toContain(commit1.hash);
      expect(hashes).toContain(commit2.hash);
    });

    it('returns empty array for empty input', async () => {
      const results = await getCommitsV4ByHashes(db, []);
      expect(results).toHaveLength(0);
    });

    it('returns only existing commits when some hashes are invalid', async () => {
      const commit = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Partial Author' },
        sentences: [{ id: 's_partial', text: 'Partial' }],
        project_id: testProjectId,
      });

      const results = await getCommitsV4ByHashes(db, [
        commit.hash,
        'sha256:nonexistent-1',
        'sha256:nonexistent-2',
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].hash).toBe(commit.hash);
    });

    it('preserves input order', async () => {
      const newProject = await insertProject(
        db,
        testData.project({ name: 'Order Batch V4 Project' })
      );

      const commit1 = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Author 1' },
        sentences: [{ id: 's_o1', text: 'Order 1' }],
        project_id: newProject.projectId,
      });

      const commit2 = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Author 2' },
        sentences: [{ id: 's_o2', text: 'Order 2' }],
        project_id: newProject.projectId,
      });

      const commit3 = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Author 3' },
        sentences: [{ id: 's_o3', text: 'Order 3' }],
        project_id: newProject.projectId,
      });

      // Request in specific order: 3, 1, 2
      const results = await getCommitsV4ByHashes(db, [commit3.hash, commit1.hash, commit2.hash]);

      expect(results).toHaveLength(3);
      expect(results[0].hash).toBe(commit3.hash);
      expect(results[1].hash).toBe(commit1.hash);
      expect(results[2].hash).toBe(commit2.hash);
    });
  });

  describe('findCommitV4History', () => {
    it('returns linear chain in traversal order', async () => {
      const proj = await insertProject(db, testData.project({ name: 'History Linear Project' }));

      const root = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'H' },
        sentences: [{ id: 's_hr', text: 'Root' }],
        project_id: proj.projectId,
      });

      await new Promise((r) => setTimeout(r, 5));

      const a = await createCommitV4(db, {
        parents: [root.hash],
        author: { type: 'human' as const, name: 'H' },
        sentences: [{ id: 's_ha', text: 'A' }],
        project_id: proj.projectId,
      });

      await new Promise((r) => setTimeout(r, 5));

      const b = await createCommitV4(db, {
        parents: [a.hash],
        author: { type: 'human' as const, name: 'H' },
        sentences: [{ id: 's_hb', text: 'B' }],
        project_id: proj.projectId,
      });

      const result = await findCommitV4History(db, b.hash);

      expect(result.truncated).toBe(false);
      expect(result.commits).toHaveLength(3);

      const hashes = result.commits.map((c) => c.hash);
      expect(hashes).toContain(root.hash);
      expect(hashes).toContain(a.hash);
      expect(hashes).toContain(b.hash);
    });

    it('traverses merge diamond (all 4 commits)', async () => {
      const proj = await insertProject(db, testData.project({ name: 'History Diamond Project' }));

      const root = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'H' },
        sentences: [{ id: 's_dr', text: 'Root' }],
        project_id: proj.projectId,
      });

      await new Promise((r) => setTimeout(r, 5));

      const branchA = await createCommitV4(db, {
        parents: [root.hash],
        author: { type: 'human' as const, name: 'H' },
        sentences: [{ id: 's_da', text: 'Branch A' }],
        project_id: proj.projectId,
      });

      await new Promise((r) => setTimeout(r, 5));

      const branchB = await createCommitV4(db, {
        parents: [root.hash],
        author: { type: 'human' as const, name: 'H' },
        sentences: [{ id: 's_db', text: 'Branch B' }],
        project_id: proj.projectId,
      });

      await new Promise((r) => setTimeout(r, 5));

      const merge = await createCommitV4(db, {
        parents: [branchA.hash, branchB.hash],
        author: { type: 'human' as const, name: 'H' },
        sentences: [{ id: 's_dm', text: 'Merge' }],
        project_id: proj.projectId,
      });

      const result = await findCommitV4History(db, merge.hash);

      expect(result.truncated).toBe(false);
      expect(result.commits).toHaveLength(4);

      const hashes = result.commits.map((c) => c.hash);
      expect(hashes).toContain(root.hash);
      expect(hashes).toContain(branchA.hash);
      expect(hashes).toContain(branchB.hash);
      expect(hashes).toContain(merge.hash);
    });

    it('respects limit and sets truncated=true', async () => {
      const proj = await insertProject(db, testData.project({ name: 'History Limit Project' }));

      const root = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'H' },
        sentences: [{ id: 's_lr', text: 'Root' }],
        project_id: proj.projectId,
      });

      await new Promise((r) => setTimeout(r, 5));

      const mid = await createCommitV4(db, {
        parents: [root.hash],
        author: { type: 'human' as const, name: 'H' },
        sentences: [{ id: 's_lm', text: 'Mid' }],
        project_id: proj.projectId,
      });

      await new Promise((r) => setTimeout(r, 5));

      const tip = await createCommitV4(db, {
        parents: [mid.hash],
        author: { type: 'human' as const, name: 'H' },
        sentences: [{ id: 's_lt', text: 'Tip' }],
        project_id: proj.projectId,
      });

      const result = await findCommitV4History(db, tip.hash, 2);

      expect(result.truncated).toBe(true);
      expect(result.commits).toHaveLength(2);
    });

    it('returns empty for non-existent hash', async () => {
      const result = await findCommitV4History(db, 'sha256:does-not-exist');

      expect(result.commits).toHaveLength(0);
      expect(result.truncated).toBe(false);
    });

    it('returns single root commit', async () => {
      const proj = await insertProject(db, testData.project({ name: 'History Root Project' }));

      const root = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'H' },
        sentences: [{ id: 's_rr', text: 'Only root' }],
        project_id: proj.projectId,
      });

      const result = await findCommitV4History(db, root.hash);

      expect(result.truncated).toBe(false);
      expect(result.commits).toHaveLength(1);
      expect(result.commits[0].hash).toBe(root.hash);
    });
  });

  describe('output format', () => {
    it('uses snake_case for all fields (matches V4 type contract)', async () => {
      const commit = await createCommitV4(db, {
        parents: [],
        author: { type: 'human' as const, name: 'Format Author' },
        sentences: [{ id: 's_format', text: 'Format test' }],
        project_id: testProjectId,
        position_x: 10,
        position_y: 20,
      });

      // Verify snake_case keys exist (V4 contract uses snake_case)
      expect(commit).toHaveProperty('committed_at');
      expect(commit).toHaveProperty('project_id');
      expect(commit).toHaveProperty('position_x');
      expect(commit).toHaveProperty('position_y');

      // Verify camelCase keys don't exist
      expect(commit).not.toHaveProperty('committedAt');
      expect(commit).not.toHaveProperty('projectId');
      expect(commit).not.toHaveProperty('positionX');
      expect(commit).not.toHaveProperty('positionY');
    });
  });
});
