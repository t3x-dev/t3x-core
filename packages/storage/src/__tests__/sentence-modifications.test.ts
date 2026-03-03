import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  findModificationsByDraft,
  insertSentenceModification,
} from '../queries/sentence-modifications';
import { createTestDB, sleep } from './setup';

describe('Sentence Modifications Storage', () => {
  let db: AnyDB;
  let _client: PGlite;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    _client = setup.client;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // insertSentenceModification
  // =========================================================================
  describe('insertSentenceModification', () => {
    it('creates a modification record with required fields', async () => {
      const record = await insertSentenceModification(db, {
        draft_id: 'draft_test1',
        sp_id: 'sp_abc',
        action: 'accept',
        actor: 'user',
      });

      expect(record).toBeDefined();
      expect(record.id).toMatch(/^smod_/);
      expect(record.draftId).toBe('draft_test1');
      expect(record.spId).toBe('sp_abc');
      expect(record.action).toBe('accept');
      expect(record.actor).toBe('user');
      expect(record.previousText).toBeNull();
      expect(record.newText).toBeNull();
      expect(record.createdAt).toBeTruthy();
    });

    it('creates a modification record with edit action and text fields', async () => {
      const record = await insertSentenceModification(db, {
        draft_id: 'draft_test1',
        sp_id: 'sp_def',
        action: 'edit',
        previous_text: 'The old sentence text.',
        new_text: 'The new edited sentence text.',
        actor: 'user',
      });

      expect(record.action).toBe('edit');
      expect(record.previousText).toBe('The old sentence text.');
      expect(record.newText).toBe('The new edited sentence text.');
    });

    it('creates a modification record with undo action', async () => {
      const record = await insertSentenceModification(db, {
        draft_id: 'draft_test1',
        sp_id: 'sp_ghi',
        action: 'undo',
        previous_text: 'Some sentence',
        actor: 'user',
      });

      expect(record.action).toBe('undo');
      expect(record.previousText).toBe('Some sentence');
      expect(record.newText).toBeNull();
    });

    it('creates a modification record with delete action', async () => {
      const record = await insertSentenceModification(db, {
        draft_id: 'draft_test1',
        sp_id: 'sp_jkl',
        action: 'delete',
        previous_text: 'Deleted sentence',
        actor: 'system',
      });

      expect(record.action).toBe('delete');
      expect(record.actor).toBe('system');
    });

    it('generates unique IDs for each record', async () => {
      const r1 = await insertSentenceModification(db, {
        draft_id: 'draft_uniq',
        sp_id: 'sp_1',
        action: 'accept',
        actor: 'user',
      });
      const r2 = await insertSentenceModification(db, {
        draft_id: 'draft_uniq',
        sp_id: 'sp_1',
        action: 'edit',
        previous_text: 'original',
        new_text: 'edited',
        actor: 'user',
      });

      expect(r1.id).not.toBe(r2.id);
    });
  });

  // =========================================================================
  // findModificationsByDraft
  // =========================================================================
  describe('findModificationsByDraft', () => {
    const testDraftId = 'draft_find_test';

    beforeAll(async () => {
      // Insert several modifications with slight delays for ordering
      await insertSentenceModification(db, {
        draft_id: testDraftId,
        sp_id: 'sp_a',
        action: 'accept',
        previous_text: 'First sentence',
        actor: 'user',
      });
      await sleep(10);
      await insertSentenceModification(db, {
        draft_id: testDraftId,
        sp_id: 'sp_b',
        action: 'edit',
        previous_text: 'Original text',
        new_text: 'Edited text',
        actor: 'user',
      });
      await sleep(10);
      await insertSentenceModification(db, {
        draft_id: testDraftId,
        sp_id: 'sp_c',
        action: 'undo',
        previous_text: 'Undone sentence',
        actor: 'user',
      });
    });

    it('returns all modifications for a draft', async () => {
      const mods = await findModificationsByDraft(db, testDraftId);
      expect(mods.length).toBe(3);
    });

    it('returns modifications in newest-first order', async () => {
      const mods = await findModificationsByDraft(db, testDraftId);
      expect(mods[0].action).toBe('undo');
      expect(mods[1].action).toBe('edit');
      expect(mods[2].action).toBe('accept');
    });

    it('returns empty array for unknown draft', async () => {
      const mods = await findModificationsByDraft(db, 'draft_nonexistent');
      expect(mods).toHaveLength(0);
    });

    it('does not return modifications from other drafts', async () => {
      // Insert into a different draft
      await insertSentenceModification(db, {
        draft_id: 'draft_other',
        sp_id: 'sp_x',
        action: 'accept',
        actor: 'system',
      });

      const mods = await findModificationsByDraft(db, testDraftId);
      const otherMods = await findModificationsByDraft(db, 'draft_other');

      // Original draft should still have 3
      expect(mods.length).toBe(3);
      // Other draft has exactly 1
      expect(otherMods.length).toBe(1);
      expect(otherMods[0].draftId).toBe('draft_other');
    });
  });
});
