import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createCommitV4 } from '../queries/commits-v4';
import {
  countHistoryByLeafId,
  createLeafHistory,
  deleteHistoryByLeafId,
  deleteLeafHistory,
  findHistoryByLeafId,
  findLeafHistoryById,
} from '../queries/leaf-history';
import { createLeaf } from '../queries/leaves';
import { insertProject } from '../queries/projects';
import { createTestDB, sleep, testData } from './setup';

describe('Leaf History Storage', () => {
  let db: AnyDB;
  let _client: PGlite;
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testLeafId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    _client = setup.client;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Leaf History Test' }));
    testProjectId = project.projectId;

    const commit = await createCommitV4(db, {
      parents: [],
      author: { type: 'human', name: 'Test' },
      sentences: [{ id: 's_1', text: 'Test sentence' }],
      project_id: testProjectId,
    });

    const leaf = await createLeaf(db, {
      commit_hash: commit.hash,
      type: 'tweet',
      project_id: testProjectId,
    });
    testLeafId = leaf.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // createLeafHistory
  // =========================================================================
  describe('createLeafHistory', () => {
    it('creates a history entry with required fields', async () => {
      const history = await createLeafHistory(db, {
        leaf_id: testLeafId,
        output: 'Generated tweet content',
        config: { model: 'gpt-4', max_tokens: 280 },
        model: 'gpt-4',
      });

      expect(history).toBeDefined();
      expect(history.id).toMatch(/^lhist_/);
      expect(history.leaf_id).toBe(testLeafId);
      expect(history.output).toBe('Generated tweet content');
      expect(history.config).toEqual({ model: 'gpt-4', max_tokens: 280 });
      expect(history.model).toBe('gpt-4');
      expect(history.generated_at).toBeTruthy();
    });

    it('creates a history entry with created_by', async () => {
      const history = await createLeafHistory(db, {
        leaf_id: testLeafId,
        output: 'Output with author',
        config: {},
        model: 'claude-3',
        created_by: 'user_123',
      });

      expect(history.created_by).toBe('user_123');
    });

    it('defaults created_by to undefined when not provided', async () => {
      const history = await createLeafHistory(db, {
        leaf_id: testLeafId,
        output: 'No author',
        config: {},
        model: 'gpt-4',
      });

      expect(history.created_by).toBeUndefined();
    });
  });

  // =========================================================================
  // findLeafHistoryById
  // =========================================================================
  describe('findLeafHistoryById', () => {
    it('returns history entry by ID', async () => {
      const created = await createLeafHistory(db, {
        leaf_id: testLeafId,
        output: 'Find me',
        config: { prompt_template: 'Hello {{topic}}' },
        model: 'gpt-4',
      });

      const found = await findLeafHistoryById(db, created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.output).toBe('Find me');
      expect(found!.config).toEqual({ prompt_template: 'Hello {{topic}}' });
    });

    it('returns null for non-existent ID', async () => {
      const found = await findLeafHistoryById(db, 'lhist_nonexistent');
      expect(found).toBeNull();
    });
  });

  // =========================================================================
  // findHistoryByLeafId
  // =========================================================================
  describe('findHistoryByLeafId', () => {
    let multiLeafId: string;

    beforeAll(async () => {
      const commit = await createCommitV4(db, {
        parents: [],
        author: { type: 'human', name: 'Test' },
        sentences: [{ id: 's_multi', text: 'Multi history' }],
        project_id: testProjectId,
      });
      const leaf = await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'email',
        project_id: testProjectId,
      });
      multiLeafId = leaf.id;

      for (let i = 0; i < 5; i++) {
        await sleep(10);
        await createLeafHistory(db, {
          leaf_id: multiLeafId,
          output: `Output ${i}`,
          config: { iteration: i },
          model: 'gpt-4',
        });
      }
    });

    it('returns all history for a leaf', async () => {
      const history = await findHistoryByLeafId(db, multiLeafId);
      expect(history).toHaveLength(5);
    });

    it('returns newest first', async () => {
      const history = await findHistoryByLeafId(db, multiLeafId);
      expect(history[0].output).toBe('Output 4');
      expect(history[4].output).toBe('Output 0');
    });

    it('respects limit', async () => {
      const history = await findHistoryByLeafId(db, multiLeafId, { limit: 2 });
      expect(history).toHaveLength(2);
    });

    it('respects offset', async () => {
      const all = await findHistoryByLeafId(db, multiLeafId);
      const offset = await findHistoryByLeafId(db, multiLeafId, { offset: 2 });
      expect(offset).toHaveLength(3);
      expect(offset[0].id).toBe(all[2].id);
    });

    it('returns empty array for unknown leaf', async () => {
      const history = await findHistoryByLeafId(db, 'leaf_unknown');
      expect(history).toHaveLength(0);
    });
  });

  // =========================================================================
  // countHistoryByLeafId
  // =========================================================================
  describe('countHistoryByLeafId', () => {
    it('returns correct count', async () => {
      const commit = await createCommitV4(db, {
        parents: [],
        author: { type: 'human', name: 'Test' },
        sentences: [{ id: 's_count', text: 'Count test' }],
        project_id: testProjectId,
      });
      const leaf = await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'tweet',
        project_id: testProjectId,
      });

      await createLeafHistory(db, {
        leaf_id: leaf.id,
        output: 'One',
        config: {},
        model: 'gpt-4',
      });
      await createLeafHistory(db, {
        leaf_id: leaf.id,
        output: 'Two',
        config: {},
        model: 'gpt-4',
      });

      const count = await countHistoryByLeafId(db, leaf.id);
      expect(count).toBe(2);
    });

    it('returns 0 for unknown leaf', async () => {
      const count = await countHistoryByLeafId(db, 'leaf_no_history');
      expect(count).toBe(0);
    });
  });

  // =========================================================================
  // deleteLeafHistory
  // =========================================================================
  describe('deleteLeafHistory', () => {
    it('deletes a single history entry', async () => {
      const history = await createLeafHistory(db, {
        leaf_id: testLeafId,
        output: 'To delete',
        config: {},
        model: 'gpt-4',
      });

      const deleted = await deleteLeafHistory(db, history.id);
      expect(deleted).toBe(true);

      const found = await findLeafHistoryById(db, history.id);
      expect(found).toBeNull();
    });

    it('returns false for non-existent ID', async () => {
      const deleted = await deleteLeafHistory(db, 'lhist_nonexistent');
      expect(deleted).toBe(false);
    });
  });

  // =========================================================================
  // deleteHistoryByLeafId
  // =========================================================================
  describe('deleteHistoryByLeafId', () => {
    it('deletes all history for a leaf', async () => {
      const commit = await createCommitV4(db, {
        parents: [],
        author: { type: 'human', name: 'Test' },
        sentences: [{ id: 's_delall', text: 'Delete all' }],
        project_id: testProjectId,
      });
      const leaf = await createLeaf(db, {
        commit_hash: commit.hash,
        type: 'article',
        project_id: testProjectId,
      });

      await createLeafHistory(db, {
        leaf_id: leaf.id,
        output: 'A',
        config: {},
        model: 'gpt-4',
      });
      await createLeafHistory(db, {
        leaf_id: leaf.id,
        output: 'B',
        config: {},
        model: 'gpt-4',
      });
      await createLeafHistory(db, {
        leaf_id: leaf.id,
        output: 'C',
        config: {},
        model: 'gpt-4',
      });

      const deletedCount = await deleteHistoryByLeafId(db, leaf.id);
      expect(deletedCount).toBe(3);

      const remaining = await findHistoryByLeafId(db, leaf.id);
      expect(remaining).toHaveLength(0);
    });

    it('returns 0 for leaf with no history', async () => {
      const deletedCount = await deleteHistoryByLeafId(db, 'leaf_no_hist');
      expect(deletedCount).toBe(0);
    });
  });
});
