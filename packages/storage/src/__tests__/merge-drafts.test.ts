import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  cancelMergeDraft,
  commitMergeDraft,
  createMergeDraft,
  deleteMergeDraft,
  findPendingMergeDraft,
  getMergeDraft,
  listMergeDraftsByProject,
  updateMergeDraft,
} from '../queries/merge-drafts';
import { insertProject } from '../queries/projects';
import { createTestDB, sleep, testData } from './setup';

describe('Merge Drafts Storage', () => {
  let db: AnyDB;
  let _client: PGlite;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    _client = setup.client;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Merge Drafts Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // createMergeDraft
  // =========================================================================
  describe('createMergeDraft', () => {
    it('creates a draft with required fields', async () => {
      const draft = await createMergeDraft(db, {
        projectId: testProjectId,
        sourceHash: 'sha256:src1',
        targetHash: 'sha256:tgt1',
        prepared: { identical: [], similar: [] },
      });

      expect(draft).toBeDefined();
      expect(draft.draftId).toBeTruthy();
      expect(draft.projectId).toBe(testProjectId);
      expect(draft.sourceHash).toBe('sha256:src1');
      expect(draft.targetHash).toBe('sha256:tgt1');
      expect(draft.status).toBe('pending');
      expect(draft.sourceBranch).toBeNull();
      expect(draft.targetBranch).toBeNull();
      expect(draft.message).toBeNull();
      expect(draft.createdAt).toBeInstanceOf(Date);
      expect(draft.updatedAt).toBeInstanceOf(Date);
    });

    it('creates a draft with optional fields', async () => {
      const draft = await createMergeDraft(db, {
        projectId: testProjectId,
        sourceHash: 'sha256:src2',
        targetHash: 'sha256:tgt2',
        sourceBranch: 'feature',
        targetBranch: 'main',
        prepared: { data: 'test' },
        message: 'Merge feature into main',
      });

      expect(draft.sourceBranch).toBe('feature');
      expect(draft.targetBranch).toBe('main');
      expect(draft.message).toBe('Merge feature into main');
    });

    it('stores prepared JSON correctly', async () => {
      const prepared = { identical: [{ id: 's1', text: 'hello' }], similar: [] };
      const draft = await createMergeDraft(db, {
        projectId: testProjectId,
        sourceHash: 'sha256:src3',
        targetHash: 'sha256:tgt3',
        prepared,
      });

      expect(JSON.parse(draft.preparedJson)).toEqual(prepared);
    });
  });

  // =========================================================================
  // getMergeDraft
  // =========================================================================
  describe('getMergeDraft', () => {
    it('returns draft by ID', async () => {
      const created = await createMergeDraft(db, {
        projectId: testProjectId,
        sourceHash: 'sha256:get1',
        targetHash: 'sha256:get2',
        prepared: {},
      });

      const found = await getMergeDraft(db, created.draftId);
      expect(found).toBeDefined();
      expect(found!.draftId).toBe(created.draftId);
      expect(found!.sourceHash).toBe('sha256:get1');
    });

    it('returns null for non-existent ID', async () => {
      const found = await getMergeDraft(db, 'nonexistent_id');
      expect(found).toBeNull();
    });
  });

  // =========================================================================
  // listMergeDraftsByProject
  // =========================================================================
  describe('listMergeDraftsByProject', () => {
    let listProjectId: string;

    beforeAll(async () => {
      const project = await insertProject(db, testData.project({ name: 'List Drafts Test' }));
      listProjectId = project.projectId;

      await createMergeDraft(db, {
        projectId: listProjectId,
        sourceHash: 'sha256:list1',
        targetHash: 'sha256:list2',
        prepared: {},
      });
      await sleep(10);
      const d2 = await createMergeDraft(db, {
        projectId: listProjectId,
        sourceHash: 'sha256:list3',
        targetHash: 'sha256:list4',
        prepared: {},
      });
      await commitMergeDraft(db, d2.draftId);
      await sleep(10);
      await createMergeDraft(db, {
        projectId: listProjectId,
        sourceHash: 'sha256:list5',
        targetHash: 'sha256:list6',
        prepared: {},
      });
    });

    it('returns all drafts for a project', async () => {
      const drafts = await listMergeDraftsByProject(db, { projectId: listProjectId });
      expect(drafts.length).toBe(3);
    });

    it('filters by status', async () => {
      const pending = await listMergeDraftsByProject(db, {
        projectId: listProjectId,
        status: 'pending',
      });
      expect(pending.length).toBe(2);

      const committed = await listMergeDraftsByProject(db, {
        projectId: listProjectId,
        status: 'committed',
      });
      expect(committed.length).toBe(1);
    });

    it('respects limit and offset', async () => {
      const first = await listMergeDraftsByProject(db, {
        projectId: listProjectId,
        limit: 1,
      });
      expect(first.length).toBe(1);

      const second = await listMergeDraftsByProject(db, {
        projectId: listProjectId,
        limit: 1,
        offset: 1,
      });
      expect(second.length).toBe(1);
      expect(second[0].draftId).not.toBe(first[0].draftId);
    });

    it('returns empty for unknown project', async () => {
      const drafts = await listMergeDraftsByProject(db, { projectId: 'proj_unknown' });
      expect(drafts).toHaveLength(0);
    });
  });

  // =========================================================================
  // updateMergeDraft
  // =========================================================================
  describe('updateMergeDraft', () => {
    it('updates message', async () => {
      const draft = await createMergeDraft(db, {
        projectId: testProjectId,
        sourceHash: 'sha256:upd1',
        targetHash: 'sha256:upd2',
        prepared: {},
      });

      const updated = await updateMergeDraft(db, draft.draftId, {
        message: 'Updated message',
      });
      expect(updated).toBeDefined();
      expect(updated!.message).toBe('Updated message');
    });

    it('updates prepared JSON', async () => {
      const draft = await createMergeDraft(db, {
        projectId: testProjectId,
        sourceHash: 'sha256:upd3',
        targetHash: 'sha256:upd4',
        prepared: { old: true },
      });

      const newPrepared = { new: true, decisions: ['keep_source'] };
      const updated = await updateMergeDraft(db, draft.draftId, { prepared: newPrepared });
      expect(JSON.parse(updated!.preparedJson)).toEqual(newPrepared);
    });

    it('updates status', async () => {
      const draft = await createMergeDraft(db, {
        projectId: testProjectId,
        sourceHash: 'sha256:upd5',
        targetHash: 'sha256:upd6',
        prepared: {},
      });

      const updated = await updateMergeDraft(db, draft.draftId, { status: 'cancelled' });
      expect(updated!.status).toBe('cancelled');
    });

    it('updates updatedAt timestamp', async () => {
      const draft = await createMergeDraft(db, {
        projectId: testProjectId,
        sourceHash: 'sha256:upd7',
        targetHash: 'sha256:upd8',
        prepared: {},
      });

      await sleep(10);
      const updated = await updateMergeDraft(db, draft.draftId, { message: 'new' });
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(draft.updatedAt.getTime());
    });

    it('returns null for non-existent ID', async () => {
      const result = await updateMergeDraft(db, 'nonexistent', { message: 'x' });
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // commitMergeDraft / cancelMergeDraft
  // =========================================================================
  describe('commitMergeDraft', () => {
    it('sets status to committed', async () => {
      const draft = await createMergeDraft(db, {
        projectId: testProjectId,
        sourceHash: 'sha256:cm1',
        targetHash: 'sha256:cm2',
        prepared: {},
      });

      const committed = await commitMergeDraft(db, draft.draftId);
      expect(committed!.status).toBe('committed');
    });
  });

  describe('cancelMergeDraft', () => {
    it('sets status to cancelled', async () => {
      const draft = await createMergeDraft(db, {
        projectId: testProjectId,
        sourceHash: 'sha256:cn1',
        targetHash: 'sha256:cn2',
        prepared: {},
      });

      const cancelled = await cancelMergeDraft(db, draft.draftId);
      expect(cancelled!.status).toBe('cancelled');
    });
  });

  // =========================================================================
  // deleteMergeDraft
  // =========================================================================
  describe('deleteMergeDraft', () => {
    it('deletes existing draft and returns true', async () => {
      const draft = await createMergeDraft(db, {
        projectId: testProjectId,
        sourceHash: 'sha256:del1',
        targetHash: 'sha256:del2',
        prepared: {},
      });

      const deleted = await deleteMergeDraft(db, draft.draftId);
      expect(deleted).toBe(true);

      const found = await getMergeDraft(db, draft.draftId);
      expect(found).toBeNull();
    });

    it('returns false for non-existent ID', async () => {
      const deleted = await deleteMergeDraft(db, 'nonexistent');
      expect(deleted).toBe(false);
    });
  });

  // =========================================================================
  // findPendingMergeDraft
  // =========================================================================
  describe('findPendingMergeDraft', () => {
    it('finds pending draft by source+target hash', async () => {
      await createMergeDraft(db, {
        projectId: testProjectId,
        sourceHash: 'sha256:pend_src',
        targetHash: 'sha256:pend_tgt',
        prepared: { found: true },
      });

      const found = await findPendingMergeDraft(
        db,
        testProjectId,
        'sha256:pend_src',
        'sha256:pend_tgt'
      );
      expect(found).toBeDefined();
      expect(found!.sourceHash).toBe('sha256:pend_src');
    });

    it('does not find committed drafts', async () => {
      const draft = await createMergeDraft(db, {
        projectId: testProjectId,
        sourceHash: 'sha256:pend_committed_src',
        targetHash: 'sha256:pend_committed_tgt',
        prepared: {},
      });
      await commitMergeDraft(db, draft.draftId);

      const found = await findPendingMergeDraft(
        db,
        testProjectId,
        'sha256:pend_committed_src',
        'sha256:pend_committed_tgt'
      );
      expect(found).toBeNull();
    });

    it('returns null when no match', async () => {
      const found = await findPendingMergeDraft(
        db,
        testProjectId,
        'sha256:no_match_src',
        'sha256:no_match_tgt'
      );
      expect(found).toBeNull();
    });
  });
});
