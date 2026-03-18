/**
 * Leaves Storage Tests
 *
 * Tests all leaf CRUD operations and verifies database effects.
 * Leaves own constraints, output, and validation results.
 *
 * @see docs/specification/semantic-layer-architecture.md
 */

import type { Assertion, ConstraintV4 as Constraint, CreateLeafInput, Leaf } from '@t3x-dev/core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createCommit } from '../queries/commits';
import {
  createLeaf,
  deleteLeaf,
  findLeafById,
  findLeavesByCommit,
  findLeavesByProject,
  getLeavesByIds,
  updateLeaf,
  updateLeafAssertions,
  updateLeafOutput,
} from '../queries/leaves';
import { decodeCursor } from '../queries/pagination';
import { insertProject } from '../queries/projects';
import { leaves } from '../schema-v4';
import { createTestDB, sleep, testData } from './setup';

describe('Leaves Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testCommitHash: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(db, testData.project({ name: 'Leaves Test Project' }));
    testProjectId = project.projectId;

    // Create a test commit (leaves require a commit hash)
    const commit = await createCommit(db, {
      parents: [],
      author: { type: 'human', name: 'Test Author' },
      content: {
        frames: [{ id: 's_1', text: 'Test sentence' }].map((s) => ({
          id: s.id,
          type: 'legacy_sentence' as const,
          slots: { text: s.text },
          confidence: s.confidence,
        })),
        relations: [],
      },
      project_id: testProjectId,
    });
    testCommitHash = commit.hash;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('createLeaf', () => {
    it('creates a leaf with all required fields', async () => {
      const input: CreateLeafInput = {
        commit_hash: testCommitHash,
        type: 'tweet',
        project_id: testProjectId,
      };

      const result = await createLeaf(db, input);

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^leaf_/);
      expect(result.commit_hash).toBe(testCommitHash);
      expect(result.type).toBe('tweet');
      expect(result.project_id).toBe(testProjectId);
      expect(result.constraints).toEqual([]);
      expect(result.config).toEqual({});
      expect(result.created_at).toBeDefined();
    });

    it('creates a leaf with title', async () => {
      const input: CreateLeafInput = {
        commit_hash: testCommitHash,
        type: 'tweet',
        title: 'My Tweet',
        project_id: testProjectId,
      };

      const result = await createLeaf(db, input);

      expect(result.title).toBe('My Tweet');
    });

    it('creates a leaf with constraints and generates IDs', async () => {
      const constraints: Constraint[] = [
        { id: '', type: 'require', match_mode: 'exact', value: 'hello' },
        { id: '', type: 'exclude', match_mode: 'semantic', value: 'goodbye' },
      ];

      const input: CreateLeafInput = {
        commit_hash: testCommitHash,
        type: 'email',
        constraints,
        project_id: testProjectId,
      };

      const result = await createLeaf(db, input);

      expect(result.constraints).toHaveLength(2);
      expect(result.constraints[0].id).toMatch(/^cst_/);
      expect(result.constraints[1].id).toMatch(/^cst_/);
      expect(result.constraints[0].type).toBe('require');
      expect(result.constraints[1].type).toBe('exclude');
    });

    it('preserves existing constraint IDs', async () => {
      const constraints: Constraint[] = [
        { id: 'cst_existing123', type: 'require', match_mode: 'exact', value: 'test' },
      ];

      const input: CreateLeafInput = {
        commit_hash: testCommitHash,
        type: 'article',
        constraints,
        project_id: testProjectId,
      };

      const result = await createLeaf(db, input);

      expect(result.constraints[0].id).toBe('cst_existing123');
    });

    it('creates a leaf with config', async () => {
      const input: CreateLeafInput = {
        commit_hash: testCommitHash,
        type: 'article',
        config: {
          prompt_template: 'Generate a {{type}} about {{topic}}',
          model: 'claude-3-opus',
          max_tokens: 1000,
        },
        project_id: testProjectId,
      };

      const result = await createLeaf(db, input);

      expect(result.config.prompt_template).toBe('Generate a {{type}} about {{topic}}');
      expect(result.config.model).toBe('claude-3-opus');
      expect(result.config.max_tokens).toBe(1000);
    });

    it('creates a leaf with created_by', async () => {
      const input: CreateLeafInput = {
        commit_hash: testCommitHash,
        type: 'slack',
        project_id: testProjectId,
        created_by: 'user_123',
      };

      const result = await createLeaf(db, input);

      expect(result.created_by).toBe('user_123');
    });

    it('stores the leaf in the database', async () => {
      const input: CreateLeafInput = {
        commit_hash: testCommitHash,
        type: 'weibo',
        project_id: testProjectId,
      };

      const result = await createLeaf(db, input);

      // Verify database effect
      const rows = await db.select().from(leaves).where(eq(leaves.id, result.id));

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(result.id);
      expect(rows[0].type).toBe('weibo');
    });
  });

  describe('findLeafById', () => {
    it('returns the leaf when it exists', async () => {
      const created = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'tweet',
        title: 'Find Me',
        project_id: testProjectId,
      });

      const found = await findLeafById(db, created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe('Find Me');
    });

    it('returns null when leaf does not exist', async () => {
      const found = await findLeafById(db, 'leaf_nonexistent');

      expect(found).toBeNull();
    });
  });

  describe('findLeavesByCommit', () => {
    it('returns leaves for a specific commit', async () => {
      // Create a new commit to avoid pollution from other tests
      const commit = await createCommit(db, {
        parents: [],
        author: { type: 'human', name: 'Commit Author' },
        content: {
          frames: [{ id: 's_commit', text: 'Commit sentence' }].map((s) => ({
            id: s.id,
            type: 'legacy_sentence' as const,
            slots: { text: s.text },
            confidence: s.confidence,
          })),
          relations: [],
        },
        project_id: testProjectId,
      });

      await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'tweet',
        project_id: testProjectId,
      });

      await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'email',
        project_id: testProjectId,
      });

      const results = await findLeavesByCommit(db, commit.hash);

      expect(results).toHaveLength(2);
      expect(results.every((l) => l.commit_hash === commit.hash)).toBe(true);
    });

    it('orders by createdAt descending', async () => {
      const commit = await createCommit(db, {
        parents: [],
        author: { type: 'human', name: 'Order Author' },
        content: {
          frames: [{ id: 's_order', text: 'Order sentence' }].map((s) => ({
            id: s.id,
            type: 'legacy_sentence' as const,
            slots: { text: s.text },
            confidence: s.confidence,
          })),
          relations: [],
        },
        project_id: testProjectId,
      });

      await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'tweet',
        title: 'First',
        project_id: testProjectId,
      });

      await new Promise((r) => setTimeout(r, 10));

      await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'email',
        title: 'Second',
        project_id: testProjectId,
      });

      const results = await findLeavesByCommit(db, commit.hash);

      expect(results[0].title).toBe('Second'); // Newer first
      expect(results[1].title).toBe('First');
    });

    it('respects limit option', async () => {
      const commit = await createCommit(db, {
        parents: [],
        author: { type: 'human', name: 'Limit Author' },
        content: {
          frames: [{ id: 's_limit', text: 'Limit sentence' }].map((s) => ({
            id: s.id,
            type: 'legacy_sentence' as const,
            slots: { text: s.text },
            confidence: s.confidence,
          })),
          relations: [],
        },
        project_id: testProjectId,
      });

      for (let i = 0; i < 5; i++) {
        await createLeaf(db, {
          commit_hash: commit.hash,
          type: 'tweet',
          project_id: testProjectId,
        });
      }

      const results = await findLeavesByCommit(db, commit.hash, { limit: 2 });

      expect(results).toHaveLength(2);
    });

    it('returns empty array when no leaves exist for commit', async () => {
      const results = await findLeavesByCommit(db, 'sha256:nonexistent');

      expect(results).toHaveLength(0);
    });

    it('filters by type', async () => {
      const commit = await createCommit(db, {
        parents: [],
        author: { type: 'human', name: 'Type Filter Author' },
        content: {
          frames: [{ id: 's_type_filter', text: 'Type filter sentence' }].map((s) => ({
            id: s.id,
            type: 'legacy_sentence' as const,
            slots: { text: s.text },
            confidence: s.confidence,
          })),
          relations: [],
        },
        project_id: testProjectId,
      });

      await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'tweet',
        project_id: testProjectId,
      });

      await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'tweet',
        project_id: testProjectId,
      });

      await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'email',
        project_id: testProjectId,
      });

      const tweetResults = await findLeavesByCommit(db, commit.hash, { type: 'tweet' });
      const emailResults = await findLeavesByCommit(db, commit.hash, { type: 'email' });
      const allResults = await findLeavesByCommit(db, commit.hash);

      expect(tweetResults).toHaveLength(2);
      expect(tweetResults.every((l) => l.type === 'tweet')).toBe(true);
      expect(emailResults).toHaveLength(1);
      expect(emailResults[0].type).toBe('email');
      expect(allResults).toHaveLength(3);
    });
  });

  describe('findLeavesByProject', () => {
    it('returns leaves for a specific project', async () => {
      const project = await insertProject(db, testData.project({ name: 'Project Leaves Test' }));

      const commit = await createCommit(db, {
        parents: [],
        author: { type: 'human', name: 'Project Author' },
        content: {
          frames: [{ id: 's_proj', text: 'Project sentence' }].map((s) => ({
            id: s.id,
            type: 'legacy_sentence' as const,
            slots: { text: s.text },
            confidence: s.confidence,
          })),
          relations: [],
        },
        project_id: project.projectId,
      });

      await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'tweet',
        project_id: project.projectId,
      });

      await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'email',
        project_id: project.projectId,
      });

      const results = await findLeavesByProject(db, project.projectId);

      expect(results).toHaveLength(2);
      expect(results.every((l) => l.project_id === project.projectId)).toBe(true);
    });

    it('respects limit and offset options', async () => {
      const project = await insertProject(db, testData.project({ name: 'Pagination Leaves Test' }));

      const commit = await createCommit(db, {
        parents: [],
        author: { type: 'human', name: 'Page Author' },
        content: {
          frames: [{ id: 's_page', text: 'Page sentence' }].map((s) => ({
            id: s.id,
            type: 'legacy_sentence' as const,
            slots: { text: s.text },
            confidence: s.confidence,
          })),
          relations: [],
        },
        project_id: project.projectId,
      });

      for (let i = 0; i < 5; i++) {
        await createLeaf(db, {
          commit_hash: commit.hash,
          type: 'tweet',
          title: `Leaf ${i}`,
          project_id: project.projectId,
        });
        await new Promise((r) => setTimeout(r, 5));
      }

      const page1 = await findLeavesByProject(db, project.projectId, { limit: 2 });
      const page2 = await findLeavesByProject(db, project.projectId, { limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
    });

    it('filters by type', async () => {
      const project = await insertProject(
        db,
        testData.project({ name: 'Type Filter Project Test' })
      );

      const commit = await createCommit(db, {
        parents: [],
        author: { type: 'human', name: 'Type Filter Project Author' },
        content: {
          frames: [{ id: 's_type_proj', text: 'Type filter project sentence' }].map((s) => ({
            id: s.id,
            type: 'legacy_sentence' as const,
            slots: { text: s.text },
            confidence: s.confidence,
          })),
          relations: [],
        },
        project_id: project.projectId,
      });

      await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'slack',
        project_id: project.projectId,
      });

      await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'slack',
        project_id: project.projectId,
      });

      await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'article',
        project_id: project.projectId,
      });

      const slackResults = await findLeavesByProject(db, project.projectId, { type: 'slack' });
      const articleResults = await findLeavesByProject(db, project.projectId, { type: 'article' });
      const allResults = await findLeavesByProject(db, project.projectId);

      expect(slackResults).toHaveLength(2);
      expect(slackResults.every((l) => l.type === 'slack')).toBe(true);
      expect(articleResults).toHaveLength(1);
      expect(articleResults[0].type).toBe('article');
      expect(allResults).toHaveLength(3);
    });
  });

  describe('updateLeaf', () => {
    it('updates leaf title', async () => {
      const created = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'tweet',
        title: 'Original',
        project_id: testProjectId,
      });

      const updated = await updateLeaf(db, created.id, { title: 'Updated' });

      expect(updated).toBeDefined();
      expect(updated!.title).toBe('Updated');
    });

    it('updates leaf constraints and generates IDs', async () => {
      const created = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'tweet',
        project_id: testProjectId,
      });

      const constraints: Constraint[] = [
        { id: '', type: 'require', match_mode: 'exact', value: 'new value' },
      ];

      const updated = await updateLeaf(db, created.id, { constraints });

      expect(updated!.constraints).toHaveLength(1);
      expect(updated!.constraints[0].id).toMatch(/^cst_/);
      expect(updated!.constraints[0].value).toBe('new value');
    });

    it('updates leaf config', async () => {
      const created = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'article',
        config: { model: 'old-model' },
        project_id: testProjectId,
      });

      const updated = await updateLeaf(db, created.id, {
        config: { model: 'new-model', max_tokens: 500 },
      });

      expect(updated!.config.model).toBe('new-model');
      expect(updated!.config.max_tokens).toBe(500);
    });

    it('updates output and sets generated_at', async () => {
      const created = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'tweet',
        project_id: testProjectId,
      });

      const updated = await updateLeaf(db, created.id, { output: 'Generated content' });

      expect(updated!.output).toBe('Generated content');
      expect(updated!.generated_at).toBeDefined();
    });

    it('updates assertions and generates IDs', async () => {
      const created = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'tweet',
        constraints: [{ id: 'cst_abc', type: 'require', match_mode: 'exact', value: 'test' }],
        project_id: testProjectId,
      });

      const assertions: Assertion[] = [
        { id: '', constraint_id: 'cst_abc', passed: true, details: 'Found' },
      ];

      const updated = await updateLeaf(db, created.id, { assertions });

      expect(updated!.assertions).toHaveLength(1);
      expect(updated!.assertions![0].id).toMatch(/^ast_/);
      expect(updated!.assertions![0].passed).toBe(true);
    });

    it('returns null when leaf does not exist', async () => {
      const updated = await updateLeaf(db, 'leaf_nonexistent', { title: 'New' });

      expect(updated).toBeNull();
    });

    it('returns existing leaf when no updates provided', async () => {
      const created = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'tweet',
        title: 'No Change',
        project_id: testProjectId,
      });

      const updated = await updateLeaf(db, created.id, {});

      expect(updated).toBeDefined();
      expect(updated!.title).toBe('No Change');
    });
  });

  describe('updateLeafOutput', () => {
    it('updates output and sets generated_at', async () => {
      const created = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'tweet',
        project_id: testProjectId,
      });

      const updated = await updateLeafOutput(db, created.id, 'New output content');

      expect(updated).toBeDefined();
      expect(updated!.output).toBe('New output content');
      expect(updated!.generated_at).toBeDefined();
    });

    it('returns null when leaf does not exist', async () => {
      const updated = await updateLeafOutput(db, 'leaf_nonexistent', 'Content');

      expect(updated).toBeNull();
    });
  });

  describe('updateLeafAssertions', () => {
    it('updates assertions with generated IDs', async () => {
      const created = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'tweet',
        constraints: [{ id: 'cst_test', type: 'require', match_mode: 'exact', value: 'test' }],
        project_id: testProjectId,
      });

      const assertions: Assertion[] = [
        { id: '', constraint_id: 'cst_test', passed: true, details: 'Found in output' },
        {
          id: '',
          constraint_id: 'cst_test',
          passed: false,
          details: 'Not found',
          lesson: 'Check formatting',
        },
      ];

      const updated = await updateLeafAssertions(db, created.id, assertions);

      expect(updated).toBeDefined();
      expect(updated!.assertions).toHaveLength(2);
      expect(updated!.assertions![0].id).toMatch(/^ast_/);
      expect(updated!.assertions![1].id).toMatch(/^ast_/);
      expect(updated!.assertions![1].lesson).toBe('Check formatting');
    });

    it('preserves existing assertion IDs', async () => {
      const created = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'email',
        project_id: testProjectId,
      });

      const assertions: Assertion[] = [
        { id: 'ast_existing', constraint_id: 'cst_1', passed: true, details: 'OK' },
      ];

      const updated = await updateLeafAssertions(db, created.id, assertions);

      expect(updated!.assertions![0].id).toBe('ast_existing');
    });

    it('returns null when leaf does not exist', async () => {
      const updated = await updateLeafAssertions(db, 'leaf_nonexistent', []);

      expect(updated).toBeNull();
    });
  });

  describe('deleteLeaf', () => {
    it('deletes a leaf', async () => {
      const created = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'tweet',
        project_id: testProjectId,
      });

      const deleted = await deleteLeaf(db, created.id);
      expect(deleted).toBe(true);

      const found = await findLeafById(db, created.id);
      expect(found).toBeNull();
    });

    it('returns false when leaf does not exist', async () => {
      const deleted = await deleteLeaf(db, 'leaf_nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('getLeavesByIds', () => {
    it('returns multiple leaves in single query', async () => {
      const commit = await createCommit(db, {
        parents: [],
        author: { type: 'human', name: 'Batch Author' },
        content: {
          frames: [{ id: 's_batch', text: 'Batch sentence' }].map((s) => ({
            id: s.id,
            type: 'legacy_sentence' as const,
            slots: { text: s.text },
            confidence: s.confidence,
          })),
          relations: [],
        },
        project_id: testProjectId,
      });

      const leaf1 = await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'tweet',
        project_id: testProjectId,
      });

      const leaf2 = await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'email',
        project_id: testProjectId,
      });

      const results = await getLeavesByIds(db, [leaf1.id, leaf2.id]);

      expect(results).toHaveLength(2);
      const ids = results.map((l) => l.id);
      expect(ids).toContain(leaf1.id);
      expect(ids).toContain(leaf2.id);
    });

    it('returns empty array for empty input', async () => {
      const results = await getLeavesByIds(db, []);
      expect(results).toHaveLength(0);
    });

    it('returns only existing leaves when some IDs are invalid', async () => {
      const created = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'tweet',
        project_id: testProjectId,
      });

      const results = await getLeavesByIds(db, [
        created.id,
        'leaf_nonexistent1',
        'leaf_nonexistent2',
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(created.id);
    });

    it('preserves input order', async () => {
      const commit = await createCommit(db, {
        parents: [],
        author: { type: 'human', name: 'Order Author' },
        content: {
          frames: [{ id: 's_order2', text: 'Order sentence' }].map((s) => ({
            id: s.id,
            type: 'legacy_sentence' as const,
            slots: { text: s.text },
            confidence: s.confidence,
          })),
          relations: [],
        },
        project_id: testProjectId,
      });

      const leaf1 = await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'tweet',
        title: 'First',
        project_id: testProjectId,
      });

      const leaf2 = await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'email',
        title: 'Second',
        project_id: testProjectId,
      });

      const leaf3 = await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'article',
        title: 'Third',
        project_id: testProjectId,
      });

      // Request in specific order: 3, 1, 2
      const results = await getLeavesByIds(db, [leaf3.id, leaf1.id, leaf2.id]);

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(leaf3.id);
      expect(results[1].id).toBe(leaf1.id);
      expect(results[2].id).toBe(leaf2.id);
    });
  });

  describe('output format', () => {
    it('uses snake_case for all fields (matches V4 type contract)', async () => {
      const created = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'tweet',
        title: 'Format Test',
        project_id: testProjectId,
        created_by: 'user_123',
      });

      // Verify snake_case keys exist
      expect(created).toHaveProperty('commit_hash');
      expect(created).toHaveProperty('project_id');
      expect(created).toHaveProperty('created_at');
      expect(created).toHaveProperty('created_by');

      // Verify camelCase keys don't exist
      expect(created).not.toHaveProperty('commitHash');
      expect(created).not.toHaveProperty('projectId');
      expect(created).not.toHaveProperty('createdAt');
      expect(created).not.toHaveProperty('createdBy');
    });

    it('converts generated_at to ISO string', async () => {
      const created = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'tweet',
        project_id: testProjectId,
      });

      const updated = await updateLeafOutput(db, created.id, 'Test output');

      expect(updated!.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('leaf types', () => {
    it.each([
      'tweet',
      'weibo',
      'wechat',
      'email',
      'article',
      'slack',
    ] as const)('supports leaf type: %s', async (type) => {
      const created = await createLeaf(db, {
        commit_hash: testCommitHash,
        type,
        project_id: testProjectId,
      });

      expect(created.type).toBe(type);

      const found = await findLeafById(db, created.id);
      expect(found!.type).toBe(type);
    });
  });

  describe('cursor pagination — findLeavesByProject', () => {
    let cursorProjectId: string;
    let allLeaves: Leaf[];

    beforeAll(async () => {
      const project = await insertProject(db, testData.project({ name: 'Cursor Pagination Test' }));
      cursorProjectId = project.projectId;

      const commit = await createCommit(db, {
        parents: [],
        author: { type: 'human', name: 'Cursor Author' },
        content: {
          frames: [{ id: 's_cursor', text: 'Cursor sentence' }].map((s) => ({
            id: s.id,
            type: 'legacy_sentence' as const,
            slots: { text: s.text },
            confidence: s.confidence,
          })),
          relations: [],
        },
        project_id: cursorProjectId,
      });

      // Create 5 leaves with distinct timestamps
      allLeaves = [];
      for (let i = 0; i < 5; i++) {
        const leaf = await createLeaf(db, {
          commit_hash: commit.hash,
          type: 'tweet',
          title: `Cursor Leaf ${i}`,
          project_id: cursorProjectId,
        });
        allLeaves.push(leaf);
        await sleep(10); // Ensure distinct timestamps
      }
    });

    it('returns first page with cursor=""', async () => {
      const page = await findLeavesByProject(db, cursorProjectId, {
        cursor: '',
        limit: 2,
      });

      expect(page.items).toHaveLength(2);
      expect(page.has_more).toBe(true);
      expect(page.next_cursor).toBeTruthy();
      // DESC order: newest first
      expect(page.items[0].title).toBe('Cursor Leaf 4');
      expect(page.items[1].title).toBe('Cursor Leaf 3');
    });

    it('paginates through all items', async () => {
      const collected: Leaf[] = [];
      let cursor = '';

      // Walk all pages
      while (true) {
        const page = await findLeavesByProject(db, cursorProjectId, {
          cursor,
          limit: 2,
        });
        collected.push(...page.items);
        if (!page.has_more) break;
        cursor = page.next_cursor!;
      }

      expect(collected).toHaveLength(5);
      // Should be in DESC order (newest first)
      expect(collected[0].title).toBe('Cursor Leaf 4');
      expect(collected[4].title).toBe('Cursor Leaf 0');
    });

    it('returns empty page when no items match', async () => {
      const page = await findLeavesByProject(db, 'proj_nonexistent', {
        cursor: '',
        limit: 10,
      });

      expect(page.items).toHaveLength(0);
      expect(page.has_more).toBe(false);
      expect(page.next_cursor).toBeNull();
    });

    it('cursor encodes created_at and id', async () => {
      const page = await findLeavesByProject(db, cursorProjectId, {
        cursor: '',
        limit: 1,
      });

      expect(page.next_cursor).toBeTruthy();
      const decoded = decodeCursor(page.next_cursor!);
      expect(decoded.t).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(decoded.k).toMatch(/^leaf_/);
    });

    it('offset mode still works (backward compatible)', async () => {
      const result = await findLeavesByProject(db, cursorProjectId, { limit: 3 });

      // Should return plain array, not CursorPage
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
    });
  });

  describe('cursor pagination — findLeavesByCommit', () => {
    let cursorCommitHash: string;
    let cursorProjId: string;

    beforeAll(async () => {
      const project = await insertProject(
        db,
        testData.project({ name: 'Cursor Commit Pagination Test' })
      );
      cursorProjId = project.projectId;

      const commit = await createCommit(db, {
        parents: [],
        author: { type: 'human', name: 'Cursor Commit Author' },
        content: {
          frames: [{ id: 's_cc', text: 'Cursor commit sentence' }].map((s) => ({
            id: s.id,
            type: 'legacy_sentence' as const,
            slots: { text: s.text },
            confidence: s.confidence,
          })),
          relations: [],
        },
        project_id: cursorProjId,
      });
      cursorCommitHash = commit.hash;

      for (let i = 0; i < 4; i++) {
        await createLeaf(db, {
          commit_hash: cursorCommitHash,
          type: 'email',
          title: `Commit Leaf ${i}`,
          project_id: cursorProjId,
        });
        await sleep(10);
      }
    });

    it('paginates through all items for a commit', async () => {
      const collected: Leaf[] = [];
      let cursor = '';

      while (true) {
        const page = await findLeavesByCommit(db, cursorCommitHash, {
          cursor,
          limit: 2,
        });
        collected.push(...page.items);
        if (!page.has_more) break;
        cursor = page.next_cursor!;
      }

      expect(collected).toHaveLength(4);
      // DESC order
      expect(collected[0].title).toBe('Commit Leaf 3');
      expect(collected[3].title).toBe('Commit Leaf 0');
    });

    it('offset mode still works for findLeavesByCommit', async () => {
      const result = await findLeavesByCommit(db, cursorCommitHash, { limit: 2 });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });
  });
});
