/**
 * Merge Results Storage Tests
 *
 * Tests all merge result operations and verifies database effects.
 * Merge results track auto-merged facets and conflicts.
 */

import type { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  deleteMergeResult,
  findMergeResultByHashes,
  findMergeResultById,
  findMergeResultsByProject,
  insertMergeResult,
} from '../queries/mergeResults';
import { insertProject } from '../queries/projects';
import { mergeResults } from '../schema';
import { createTestDB, testData } from './setup';

describe('Merge Results Storage', () => {
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
    const project = await insertProject(
      db,
      testData.project({ name: 'Merge Result Test Project' })
    );
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('insertMergeResult', () => {
    it('creates a merge result with generated ID', async () => {
      const input = {
        projectId: testProjectId,
        baseCommitHash: 'sha256:base123',
        sourceCommitHash: 'sha256:source123',
        targetCommitHash: 'sha256:target123',
        status: 'clean' as const,
        autoMerged: [{ type: 'keyword', value: 'test' }],
        conflicts: [],
      };

      const result = await insertMergeResult(db, input);

      expect(result).toBeDefined();
      expect(result.mergeResultId).toMatch(/^merge_[a-f0-9]+$/);
      expect(result.status).toBe('clean');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('stores the merge result in the database', async () => {
      const input = {
        projectId: testProjectId,
        baseCommitHash: 'sha256:base456',
        sourceCommitHash: 'sha256:source456',
        targetCommitHash: 'sha256:target456',
        status: 'clean' as const,
        autoMerged: [],
        conflicts: [],
      };

      const result = await insertMergeResult(db, input);

      // Verify database effect
      const rows = await db
        .select()
        .from(mergeResults)
        .where(eq(mergeResults.mergeResultId, result.mergeResultId));

      expect(rows).toHaveLength(1);
      expect(rows[0].projectId).toBe(testProjectId);
      expect(rows[0].baseCommitHash).toBe('sha256:base456');
    });

    it('stores autoMerged as JSON', async () => {
      const autoMerged = [
        { type: 'keyword', value: 'merged1' },
        { type: 'entity', value: 'user' },
      ];

      const result = await insertMergeResult(db, {
        projectId: testProjectId,
        baseCommitHash: 'sha256:am1',
        sourceCommitHash: 'sha256:am2',
        targetCommitHash: 'sha256:am3',
        status: 'clean',
        autoMerged,
        conflicts: [],
      });

      const stored = JSON.parse(result.autoMergedJson);
      expect(stored).toEqual(autoMerged);
    });

    it('stores conflicts as JSON', async () => {
      const conflicts = [{ path: 'facet.keyword', source: 'a', target: 'b' }];

      const result = await insertMergeResult(db, {
        projectId: testProjectId,
        baseCommitHash: 'sha256:conf1',
        sourceCommitHash: 'sha256:conf2',
        targetCommitHash: 'sha256:conf3',
        status: 'conflicts',
        autoMerged: [],
        conflicts,
      });

      const stored = JSON.parse(result.conflictsJson);
      expect(stored).toEqual(conflicts);
    });

    it('supports conflicts status', async () => {
      const result = await insertMergeResult(db, {
        projectId: testProjectId,
        baseCommitHash: 'sha256:cs1',
        sourceCommitHash: 'sha256:cs2',
        targetCommitHash: 'sha256:cs3',
        status: 'conflicts',
        autoMerged: [],
        conflicts: [{ path: 'facet.a' }],
      });

      expect(result.status).toBe('conflicts');
    });
  });

  describe('findMergeResultById', () => {
    it('returns the merge result when it exists', async () => {
      const created = await insertMergeResult(db, {
        projectId: testProjectId,
        baseCommitHash: 'sha256:find1',
        sourceCommitHash: 'sha256:find2',
        targetCommitHash: 'sha256:find3',
        status: 'clean',
        autoMerged: [],
        conflicts: [],
      });

      const found = await findMergeResultById(db, created.mergeResultId);

      expect(found).toBeDefined();
      expect(found!.mergeResultId).toBe(created.mergeResultId);
    });

    it('returns null when merge result does not exist', async () => {
      const found = await findMergeResultById(db, 'merge_nonexistent');

      expect(found).toBeNull();
    });
  });

  describe('findMergeResultByHashes', () => {
    it('returns merge result matching all three hashes', async () => {
      const created = await insertMergeResult(db, {
        projectId: testProjectId,
        baseCommitHash: 'sha256:hash_base',
        sourceCommitHash: 'sha256:hash_source',
        targetCommitHash: 'sha256:hash_target',
        status: 'clean',
        autoMerged: [],
        conflicts: [],
      });

      const found = await findMergeResultByHashes(
        db,
        'sha256:hash_base',
        'sha256:hash_source',
        'sha256:hash_target'
      );

      expect(found).toBeDefined();
      expect(found!.mergeResultId).toBe(created.mergeResultId);
    });

    it('returns null when no match', async () => {
      const found = await findMergeResultByHashes(
        db,
        'sha256:no_match1',
        'sha256:no_match2',
        'sha256:no_match3'
      );

      expect(found).toBeNull();
    });

    it('returns latest when multiple matches exist', async () => {
      // Create first
      await insertMergeResult(db, {
        projectId: testProjectId,
        baseCommitHash: 'sha256:multi_base',
        sourceCommitHash: 'sha256:multi_source',
        targetCommitHash: 'sha256:multi_target',
        status: 'conflicts',
        autoMerged: [],
        conflicts: [{ path: 'a' }],
      });

      // Create second (more recent)
      const second = await insertMergeResult(db, {
        projectId: testProjectId,
        baseCommitHash: 'sha256:multi_base',
        sourceCommitHash: 'sha256:multi_source',
        targetCommitHash: 'sha256:multi_target',
        status: 'clean',
        autoMerged: [{ resolved: true }],
        conflicts: [],
      });

      const found = await findMergeResultByHashes(
        db,
        'sha256:multi_base',
        'sha256:multi_source',
        'sha256:multi_target'
      );

      expect(found!.mergeResultId).toBe(second.mergeResultId);
      expect(found!.status).toBe('clean');
    });
  });

  describe('findMergeResultsByProject', () => {
    it('returns merge results for a project', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'List Merges Project' }));

      await insertMergeResult(db, {
        projectId: newProject.projectId,
        baseCommitHash: 'sha256:lm1',
        sourceCommitHash: 'sha256:lm2',
        targetCommitHash: 'sha256:lm3',
        status: 'clean',
        autoMerged: [],
        conflicts: [],
      });
      await insertMergeResult(db, {
        projectId: newProject.projectId,
        baseCommitHash: 'sha256:lm4',
        sourceCommitHash: 'sha256:lm5',
        targetCommitHash: 'sha256:lm6',
        status: 'clean',
        autoMerged: [],
        conflicts: [],
      });

      const results = await findMergeResultsByProject(db, newProject.projectId);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.projectId === newProject.projectId)).toBe(true);
    });

    it('returns empty array for project with no merge results', async () => {
      const emptyProject = await insertProject(db, testData.project({ name: 'No Merges' }));

      const results = await findMergeResultsByProject(db, emptyProject.projectId);

      expect(results).toHaveLength(0);
    });

    it('respects limit option', async () => {
      const results = await findMergeResultsByProject(db, testProjectId, 2);

      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('deleteMergeResult', () => {
    it('deletes the merge result from database', async () => {
      const created = await insertMergeResult(db, {
        projectId: testProjectId,
        baseCommitHash: 'sha256:del1',
        sourceCommitHash: 'sha256:del2',
        targetCommitHash: 'sha256:del3',
        status: 'clean',
        autoMerged: [],
        conflicts: [],
      });

      const deleted = await deleteMergeResult(db, created.mergeResultId);

      expect(deleted).toBe(true);

      const found = await findMergeResultById(db, created.mergeResultId);
      expect(found).toBeNull();
    });

    it('returns false when merge result does not exist', async () => {
      const deleted = await deleteMergeResult(db, 'merge_nonexistent');

      expect(deleted).toBe(false);
    });
  });
});
