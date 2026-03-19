/**
 * Drafts Storage Tests
 *
 * Tests all draft operations and verifies database effects.
 * Drafts track LLM-generated content with lifecycle states.
 */

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  adoptAgentDraft,
  deleteAgentDraft,
  findAgentDraftById,
  findAgentDraftsByProject,
  getAgentDraftTextHash,
  insertAgentDraft,
  supersedeAgentDraft,
  updateAgentDraft,
  updateAgentDraftStatus,
} from '../queries/agent-drafts';
import { insertConversation } from '../queries/conversations';
import { insertProject } from '../queries/projects';
import { agentDrafts as drafts } from '../schema';
import { createTestDB, testData } from './setup';

describe('Drafts Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    // Create a test project and conversation
    const project = await insertProject(db, testData.project({ name: 'Draft Test Project' }));
    testProjectId = project.projectId;

    const conv = await insertConversation(
      db,
      testData.conversation(testProjectId, { title: 'Draft Test Chat' })
    );
    testConversationId = conv.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('insertAgentDraft', () => {
    it('creates a draft with generated ID', async () => {
      const input = {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'summary',
        bridgePayload: { intent: 'summarize' },
        llmConfig: { model: 'claude-3' },
        text: 'This is a summary.',
      };

      const result = await insertAgentDraft(db, input);

      expect(result).toBeDefined();
      expect(result.draftId).toMatch(/^draft_[a-f0-9]+$/);
      expect(result.bridgeId).toBe('summary');
      expect(result.text).toBe('This is a summary.');
      expect(result.status).toBe('ephemeral');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('stores the draft in the database', async () => {
      const input = {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'qa',
        bridgePayload: {},
        llmConfig: {},
        text: 'Stored draft',
      };

      const result = await insertAgentDraft(db, input);

      // Verify database effect
      const rows = await db.select().from(drafts).where(eq(drafts.draftId, result.draftId));

      expect(rows).toHaveLength(1);
      expect(rows[0].text).toBe('Stored draft');
      expect(rows[0].projectId).toBe(testProjectId);
    });

    it('stores bridge payload as JSON', async () => {
      const payload = { intent: 'answer', context: ['fact1', 'fact2'] };

      const result = await insertAgentDraft(db, {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'qa',
        bridgePayload: payload,
        llmConfig: {},
        text: 'Answer text',
      });

      const stored = JSON.parse(result.bridgePayloadJson);
      expect(stored).toEqual(payload);
    });

    it('stores LLM config as JSON', async () => {
      const config = { model: 'claude-3-opus', temperature: 0.7 };

      const result = await insertAgentDraft(db, {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'test',
        bridgePayload: {},
        llmConfig: config,
        text: 'LLM output',
      });

      const stored = JSON.parse(result.llmConfigJson);
      expect(stored).toEqual(config);
    });

    it('stores mustHave when provided', async () => {
      const mustHave = [{ type: 'keyword', value: 'important' }];

      const result = await insertAgentDraft(db, {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'test',
        bridgePayload: {},
        llmConfig: {},
        text: 'Text with mustHave',
        mustHave,
      });

      expect(result.mustHaveJson).toBeDefined();
      const stored = JSON.parse(result.mustHaveJson!);
      expect(stored).toEqual(mustHave);
    });

    it('stores base commit hash when provided', async () => {
      const result = await insertAgentDraft(db, {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'test',
        bridgePayload: {},
        llmConfig: {},
        text: 'Draft with base',
        baseCommitHash: 'sha256:abc123',
      });

      expect(result.baseCommitHash).toBe('sha256:abc123');
    });
  });

  describe('findAgentDraftById', () => {
    it('returns the draft when it exists', async () => {
      const created = await insertAgentDraft(db, {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'find-test',
        bridgePayload: {},
        llmConfig: {},
        text: 'Find me',
      });

      const found = await findAgentDraftById(db, created.draftId);

      expect(found).toBeDefined();
      expect(found!.draftId).toBe(created.draftId);
      expect(found!.text).toBe('Find me');
    });

    it('returns null when draft does not exist', async () => {
      const found = await findAgentDraftById(db, 'draft_nonexistent');

      expect(found).toBeNull();
    });
  });

  describe('findAgentDraftsByProject', () => {
    it('returns drafts for a project', async () => {
      const newProject = await insertProject(db, testData.project({ name: 'List Drafts Project' }));
      const conv = await insertConversation(db, testData.conversation(newProject.projectId));

      await insertAgentDraft(db, {
        projectId: newProject.projectId,
        conversationId: conv.conversationId,
        bridgeId: 'a',
        bridgePayload: {},
        llmConfig: {},
        text: 'Draft A',
      });
      await insertAgentDraft(db, {
        projectId: newProject.projectId,
        conversationId: conv.conversationId,
        bridgeId: 'b',
        bridgePayload: {},
        llmConfig: {},
        text: 'Draft B',
      });

      const results = await findAgentDraftsByProject(db, { projectId: newProject.projectId });

      expect(results).toHaveLength(2);
      expect(results.every((d) => d.projectId === newProject.projectId)).toBe(true);
    });

    it('filters by status', async () => {
      const newProject = await insertProject(
        db,
        testData.project({ name: 'Status Filter Project' })
      );
      const conv = await insertConversation(db, testData.conversation(newProject.projectId));

      const ephemeral = await insertAgentDraft(db, {
        projectId: newProject.projectId,
        conversationId: conv.conversationId,
        bridgeId: 'e',
        bridgePayload: {},
        llmConfig: {},
        text: 'Ephemeral',
      });

      const toAdopt = await insertAgentDraft(db, {
        projectId: newProject.projectId,
        conversationId: conv.conversationId,
        bridgeId: 'a',
        bridgePayload: {},
        llmConfig: {},
        text: 'To adopt',
      });
      await adoptAgentDraft(db, toAdopt.draftId);

      const ephemeralResults = await findAgentDraftsByProject(db, {
        projectId: newProject.projectId,
        status: 'ephemeral',
      });
      const adoptedResults = await findAgentDraftsByProject(db, {
        projectId: newProject.projectId,
        status: 'adopted',
      });

      expect(ephemeralResults).toHaveLength(1);
      expect(ephemeralResults[0].draftId).toBe(ephemeral.draftId);
      expect(adoptedResults).toHaveLength(1);
      expect(adoptedResults[0].draftId).toBe(toAdopt.draftId);
    });

    it('respects limit option', async () => {
      const results = await findAgentDraftsByProject(db, { projectId: testProjectId, limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('updateAgentDraft', () => {
    it('updates draft text', async () => {
      const created = await insertAgentDraft(db, {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'update-test',
        bridgePayload: {},
        llmConfig: {},
        text: 'Original text',
      });

      const updated = await updateAgentDraft(db, created.draftId, { text: 'Updated text' });

      expect(updated).toBeDefined();
      expect(updated!.text).toBe('Updated text');

      // Verify database effect
      const rows = await db.select().from(drafts).where(eq(drafts.draftId, created.draftId));

      expect(rows[0].text).toBe('Updated text');
    });

    it('updates mustHave', async () => {
      const created = await insertAgentDraft(db, {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'update-musthave',
        bridgePayload: {},
        llmConfig: {},
        text: 'Original',
      });

      const newMustHave = [{ type: 'entity', value: 'user' }];
      const updated = await updateAgentDraft(db, created.draftId, { mustHave: newMustHave });

      expect(updated!.mustHaveJson).toBeDefined();
      const stored = JSON.parse(updated!.mustHaveJson!);
      expect(stored).toEqual(newMustHave);
    });

    it('returns null when draft does not exist', async () => {
      const result = await updateAgentDraft(db, 'draft_nonexistent', { text: 'New' });

      expect(result).toBeNull();
    });
  });

  describe('updateAgentDraftStatus', () => {
    it('updates status from ephemeral to adopted', async () => {
      const created = await insertAgentDraft(db, {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'status-test',
        bridgePayload: {},
        llmConfig: {},
        text: 'Status test',
      });

      expect(created.status).toBe('ephemeral');
      expect(created.completedAt).toBeNull();

      const updated = await updateAgentDraftStatus(db, created.draftId, 'adopted');

      expect(updated!.status).toBe('adopted');
      expect(updated!.completedAt).toBeInstanceOf(Date);
    });

    it('sets completedAt when transitioning to adopted/superseded', async () => {
      const created = await insertAgentDraft(db, {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'completed-test',
        bridgePayload: {},
        llmConfig: {},
        text: 'Completed test',
      });

      const updated = await updateAgentDraftStatus(db, created.draftId, 'superseded');

      expect(updated!.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('adoptAgentDraft', () => {
    it('marks draft as adopted', async () => {
      const created = await insertAgentDraft(db, {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'adopt-test',
        bridgePayload: {},
        llmConfig: {},
        text: 'To adopt',
      });

      const adopted = await adoptAgentDraft(db, created.draftId);

      expect(adopted).toBeDefined();
      expect(adopted!.status).toBe('adopted');
    });
  });

  describe('supersedeAgentDraft', () => {
    it('marks draft as superseded', async () => {
      const created = await insertAgentDraft(db, {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'supersede-test',
        bridgePayload: {},
        llmConfig: {},
        text: 'To supersede',
      });

      const superseded = await supersedeAgentDraft(db, created.draftId);

      expect(superseded).toBeDefined();
      expect(superseded!.status).toBe('superseded');
    });
  });

  describe('getAgentDraftTextHash', () => {
    it('returns text hash for draft', async () => {
      const created = await insertAgentDraft(db, {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'hash-test',
        bridgePayload: {},
        llmConfig: {},
        text: 'Hash this text',
      });

      const hash = await getAgentDraftTextHash(db, created.draftId);

      expect(hash).toBeDefined();
      expect(hash).toMatch(/^sha256:[a-f0-9]+$/);
    });

    it('returns null when draft does not exist', async () => {
      const hash = await getAgentDraftTextHash(db, 'draft_nonexistent');

      expect(hash).toBeNull();
    });
  });

  describe('deleteAgentDraft', () => {
    it('deletes the draft from database', async () => {
      const created = await insertAgentDraft(db, {
        projectId: testProjectId,
        conversationId: testConversationId,
        bridgeId: 'delete-test',
        bridgePayload: {},
        llmConfig: {},
        text: 'To delete',
      });

      const deleted = await deleteAgentDraft(db, created.draftId);

      expect(deleted).toBe(true);

      const found = await findAgentDraftById(db, created.draftId);
      expect(found).toBeNull();
    });

    it('returns false when draft does not exist', async () => {
      const deleted = await deleteAgentDraft(db, 'draft_nonexistent');

      expect(deleted).toBe(false);
    });
  });
});
