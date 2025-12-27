/**
 * Conversations Storage Tests
 *
 * Tests all conversation CRUD operations and verifies database effects.
 */

import type { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  deleteConversation,
  findConversationById,
  findConversationsByProject,
  getConversationTurnCount,
  insertConversation,
  updateConversation,
} from '../queries/conversations';
import { insertProject } from '../queries/projects';
import { insertTurn } from '../queries/turns';
import { conversations } from '../schema';
import { createTestDB, testData } from './setup';

describe('Conversations Storage', () => {
  let db: AnyDB;
  let _client: PGlite;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    _client = setup.client;
    cleanup = setup.cleanup;

    // Create a test project for all conversation tests
    const project = await insertProject(
      db,
      testData.project({ name: 'Conversation Test Project' })
    );
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('insertConversation', () => {
    it('creates a conversation with generated ID', async () => {
      const input = testData.conversation(testProjectId, { title: 'Test Chat' });

      const result = await insertConversation(db, input);

      expect(result).toBeDefined();
      expect(result.conversationId).toMatch(/^conv_[a-f0-9]+$/);
      expect(result.title).toBe('Test Chat');
      expect(result.projectId).toBe(testProjectId);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('stores the conversation in the database', async () => {
      const input = testData.conversation(testProjectId, { title: 'DB Stored Chat' });

      const result = await insertConversation(db, input);

      // Verify database effect
      const rows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.conversationId, result.conversationId));

      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('DB Stored Chat');
      expect(rows[0].projectId).toBe(testProjectId);
    });

    it('allows null title', async () => {
      const result = await insertConversation(db, { projectId: testProjectId });

      expect(result.title).toBeNull();
    });
  });

  describe('findConversationById', () => {
    it('returns the conversation when it exists', async () => {
      const created = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Find Me' })
      );

      const found = await findConversationById(db, created.conversationId);

      expect(found).toBeDefined();
      expect(found!.conversationId).toBe(created.conversationId);
      expect(found!.title).toBe('Find Me');
    });

    it('returns null when conversation does not exist', async () => {
      const found = await findConversationById(db, 'conv_nonexistent');

      expect(found).toBeNull();
    });
  });

  describe('findConversationsByProject', () => {
    it('returns conversations for a project', async () => {
      // Create conversations
      await insertConversation(db, testData.conversation(testProjectId, { title: 'Chat 1' }));
      await insertConversation(db, testData.conversation(testProjectId, { title: 'Chat 2' }));

      const results = await findConversationsByProject(db, { projectId: testProjectId });

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.every((c) => c.projectId === testProjectId)).toBe(true);
    });

    it('returns empty array for project with no conversations', async () => {
      // Create a new project with no conversations
      const newProject = await insertProject(db, testData.project({ name: 'Empty Project' }));

      const results = await findConversationsByProject(db, { projectId: newProject.projectId });

      expect(results).toHaveLength(0);
    });

    it('respects limit option', async () => {
      const results = await findConversationsByProject(db, { projectId: testProjectId, limit: 1 });

      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('updateConversation', () => {
    it('updates conversation title', async () => {
      const created = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Old Title' })
      );

      const updated = await updateConversation(db, created.conversationId, { title: 'New Title' });

      expect(updated).toBeDefined();
      expect(updated!.title).toBe('New Title');

      // Verify database effect
      const rows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.conversationId, created.conversationId));

      expect(rows[0].title).toBe('New Title');
    });

    it('returns null when conversation does not exist', async () => {
      const updated = await updateConversation(db, 'conv_nonexistent', { title: 'New' });

      expect(updated).toBeNull();
    });
  });

  describe('deleteConversation', () => {
    it('deletes the conversation from database', async () => {
      const created = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'To Delete' })
      );

      const deleted = await deleteConversation(db, created.conversationId);

      expect(deleted).toBe(true);

      // Verify database effect
      const found = await findConversationById(db, created.conversationId);
      expect(found).toBeNull();
    });

    it('returns false when conversation does not exist', async () => {
      const deleted = await deleteConversation(db, 'conv_nonexistent');

      expect(deleted).toBe(false);
    });
  });

  describe('getConversationTurnCount', () => {
    it('returns 0 for conversation with no turns', async () => {
      const conv = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Empty Conv' })
      );

      const count = await getConversationTurnCount(db, conv.conversationId);

      expect(count).toBe(0);
    });

    it('returns correct count after adding turns', async () => {
      const conv = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'With Turns' })
      );

      // Add turns
      await insertTurn(
        db,
        testData.turn(testProjectId, conv.conversationId, { content: 'Turn 1' })
      );
      await insertTurn(
        db,
        testData.turn(testProjectId, conv.conversationId, { content: 'Turn 2' })
      );
      await insertTurn(
        db,
        testData.turn(testProjectId, conv.conversationId, { content: 'Turn 3' })
      );

      const count = await getConversationTurnCount(db, conv.conversationId);

      expect(count).toBe(3);
    });
  });
});
