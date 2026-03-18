/**
 * Auto-Draft Storage Tests (Upgrade #7)
 *
 * Tests for auto-draft creation, lookup by conversation, and promotion.
 */

import type { DraftSentence } from '@t3x-dev/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  findAutoDraftsByConversation,
  findDraftById,
  insertAutoDraft,
  insertDraft,
  listDraftsByProject,
  promoteDraft,
} from '../queries/drafts';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

function makeSentences(texts: string[]): DraftSentence[] {
  return texts.map((text, i) => ({
    id: `ds_auto_${i}`,
    text,
    origin: { type: 'extracted' as const, segment_id: `seg_${i}`, confidence: 0.85 },
    position: i,
    included: true,
  }));
}

describe('Auto-Draft Storage (Upgrade #7)', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Auto Draft Test' }));
    projectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('insertAutoDraft', () => {
    it('creates draft with status=auto', async () => {
      const draft = await insertAutoDraft(db, {
        project_id: projectId,
        conversation_id: 'conv_test_001',
        title: 'Auto-draft from conversation',
        sentences: makeSentences(['User prefers luxury hotels', 'Budget is $3000']),
      });

      expect(draft.status).toBe('auto');
      expect(draft.goal).toBe('auto:conv_test_001');
      expect(draft.sentences).toHaveLength(2);
      expect(draft.sentences[0].text).toBe('User prefers luxury hotels');
    });

    it('stores conversation_id in goal field', async () => {
      const draft = await insertAutoDraft(db, {
        project_id: projectId,
        conversation_id: 'conv_test_002',
        title: 'Another auto-draft',
        sentences: makeSentences(['Test sentence']),
      });

      expect(draft.goal).toBe('auto:conv_test_002');
    });

    it('sets parent_commit_hash when provided', async () => {
      const draft = await insertAutoDraft(db, {
        project_id: projectId,
        conversation_id: 'conv_test_003',
        title: 'Draft with parent',
        sentences: makeSentences(['Sentence']),
        parent_commit_hash: 'sha256:fakehash',
      });

      expect(draft.parent_commit_hash).toBe('sha256:fakehash');
    });
  });

  describe('findAutoDraftsByConversation', () => {
    it('finds auto-drafts by conversation_id', async () => {
      const drafts = await findAutoDraftsByConversation(db, projectId, 'conv_test_001');

      expect(drafts.length).toBeGreaterThanOrEqual(1);
      expect(drafts.every((d) => d.status === 'auto')).toBe(true);
      expect(drafts.every((d) => d.goal === 'auto:conv_test_001')).toBe(true);
    });

    it('returns empty for non-existent conversation', async () => {
      const drafts = await findAutoDraftsByConversation(db, projectId, 'conv_nonexistent');

      expect(drafts).toHaveLength(0);
    });
  });

  describe('listDraftsByProject with status=auto', () => {
    it('can filter by auto status', async () => {
      const drafts = await listDraftsByProject(db, projectId, { status: 'auto' });

      expect(drafts.length).toBeGreaterThanOrEqual(1);
      expect(drafts.every((d) => d.status === 'auto')).toBe(true);
    });

    it('editing filter excludes auto drafts', async () => {
      const editingDrafts = await listDraftsByProject(db, projectId, { status: 'editing' });

      expect(editingDrafts.every((d) => d.status === 'editing')).toBe(true);
    });
  });

  describe('promoteDraft', () => {
    it('promotes auto-draft to editing status', async () => {
      const autoDraft = await insertAutoDraft(db, {
        project_id: projectId,
        conversation_id: 'conv_promote_001',
        title: 'Promote me',
        sentences: makeSentences(['Promotable sentence']),
      });

      expect(autoDraft.status).toBe('auto');

      const promoted = await promoteDraft(db, autoDraft.id);

      expect(promoted.status).toBe('editing');
      expect(promoted.sentences).toHaveLength(1);
    });

    it('throws for non-existent draft', async () => {
      await expect(promoteDraft(db, 'draft_nonexistent')).rejects.toThrow('not found');
    });

    it('throws for non-auto draft', async () => {
      const editingDraft = await insertDraft(db, {
        project_id: projectId,
        title: 'Normal editing draft',
      });

      await expect(promoteDraft(db, editingDraft.id)).rejects.toThrow('Cannot promote');
    });

    it('preserves sentences after promotion', async () => {
      const autoDraft = await insertAutoDraft(db, {
        project_id: projectId,
        conversation_id: 'conv_promote_002',
        title: 'Check sentences',
        sentences: makeSentences(['Sentence A', 'Sentence B']),
      });

      const promoted = await promoteDraft(db, autoDraft.id);
      const fetched = await findDraftById(db, promoted.id);

      expect(fetched).not.toBeNull();
      expect(fetched!.sentences).toHaveLength(2);
      expect(fetched!.sentences[0].text).toBe('Sentence A');
      expect(fetched!.sentences[1].text).toBe('Sentence B');
    });
  });
});
