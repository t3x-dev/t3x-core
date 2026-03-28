/**
 * Conversation Contexts Storage Tests
 *
 * Tests all conversation context CRUD operations and verifies database effects.
 * Conversation contexts store per-conversation pin selection configuration.
 *
 * Default behavior (no row): use all project pins.
 * null selectedPinIds: use all project pins.
 * [] selectedPinIds: no pins (fresh start).
 * [...ids] selectedPinIds: specific pins only.
 *
 * @see docs/specification/semantic-layer-architecture.md
 */

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  deleteConversationContext,
  getConversationContext,
  setConversationContext,
} from '../queries/conversation-contexts';
import { insertConversation } from '../queries/conversations';
import { insertProject } from '../queries/projects';
import { conversationContexts } from '../schema-trees';
import { createTestDB, testData } from './setup';

describe('Conversation Contexts Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let _testConversationId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(
      db,
      testData.project({ name: 'Conversation Contexts Test Project' })
    );
    testProjectId = project.projectId;

    // Create a test conversation
    const conversation = await insertConversation(
      db,
      testData.conversation(testProjectId, { title: 'Test Conversation' })
    );
    _testConversationId = conversation.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('getConversationContext', () => {
    it('returns null when no context exists', async () => {
      // Create a new conversation without any context
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'No Context Conversation' })
      );

      const result = await getConversationContext(db, conversation.conversationId);

      expect(result).toBeNull();
    });

    it('returns the context when it exists', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'With Context Conversation' })
      );

      // First create a context
      await setConversationContext(db, conversation.conversationId, ['pin_1', 'pin_2']);

      const result = await getConversationContext(db, conversation.conversationId);

      expect(result).toBeDefined();
      expect(result!.conversation_id).toBe(conversation.conversationId);
      expect(result!.selected_pin_ids).toEqual(['pin_1', 'pin_2']);
      expect(result!.updated_at).toBeDefined();
    });
  });

  describe('setConversationContext', () => {
    it('creates a new context when none exists', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Create Context Test' })
      );

      const result = await setConversationContext(db, conversation.conversationId, [
        'pin_a',
        'pin_b',
      ]);

      expect(result).toBeDefined();
      expect(result.conversation_id).toBe(conversation.conversationId);
      expect(result.selected_pin_ids).toEqual(['pin_a', 'pin_b']);
      expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('updates existing context when one exists', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Update Context Test' })
      );

      // Create initial context
      const initial = await setConversationContext(db, conversation.conversationId, ['pin_1']);

      // Wait a bit to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));

      // Update context
      const updated = await setConversationContext(db, conversation.conversationId, [
        'pin_2',
        'pin_3',
      ]);

      expect(updated.conversation_id).toBe(conversation.conversationId);
      expect(updated.selected_pin_ids).toEqual(['pin_2', 'pin_3']);
      expect(updated.updated_at).not.toBe(initial.updated_at);
    });

    it('allows null pinIds (use all project pins)', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Null PinIds Test' })
      );

      const result = await setConversationContext(db, conversation.conversationId, null);

      expect(result.selected_pin_ids).toBeNull();
    });

    it('allows empty array pinIds (no pins)', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Empty PinIds Test' })
      );

      const result = await setConversationContext(db, conversation.conversationId, []);

      expect(result.selected_pin_ids).toEqual([]);
    });

    it('stores the context in the database', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'DB Store Test' })
      );

      await setConversationContext(db, conversation.conversationId, ['pin_db_1', 'pin_db_2']);

      // Verify database effect
      const rows = await db
        .select()
        .from(conversationContexts)
        .where(eq(conversationContexts.conversationId, conversation.conversationId));

      expect(rows).toHaveLength(1);
      expect(rows[0].conversationId).toBe(conversation.conversationId);
      expect(rows[0].selectedPinIds).toEqual(['pin_db_1', 'pin_db_2']);
    });
  });

  describe('deleteConversationContext', () => {
    it('deletes existing context and returns true', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Delete Context Test' })
      );

      // Create a context first
      await setConversationContext(db, conversation.conversationId, ['pin_x']);

      // Delete it
      const deleted = await deleteConversationContext(db, conversation.conversationId);
      expect(deleted).toBe(true);

      // Verify it's gone
      const result = await getConversationContext(db, conversation.conversationId);
      expect(result).toBeNull();
    });

    it('returns false when no context exists', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Delete Nonexistent Test' })
      );

      const deleted = await deleteConversationContext(db, conversation.conversationId);
      expect(deleted).toBe(false);
    });

    it('removes the row from the database', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Delete DB Test' })
      );

      await setConversationContext(db, conversation.conversationId, ['pin_del']);
      await deleteConversationContext(db, conversation.conversationId);

      // Verify database effect
      const rows = await db
        .select()
        .from(conversationContexts)
        .where(eq(conversationContexts.conversationId, conversation.conversationId));

      expect(rows).toHaveLength(0);
    });
  });

  describe('output format', () => {
    it('uses snake_case for all fields (matches V4 type contract)', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Format Test' })
      );

      const result = await setConversationContext(db, conversation.conversationId, ['pin_format']);

      // Verify snake_case keys exist
      expect(result).toHaveProperty('conversation_id');
      expect(result).toHaveProperty('selected_pin_ids');
      expect(result).toHaveProperty('updated_at');

      // Verify camelCase keys don't exist
      expect(result).not.toHaveProperty('conversationId');
      expect(result).not.toHaveProperty('selectedPinIds');
      expect(result).not.toHaveProperty('updatedAt');
    });

    it('converts updated_at to ISO string', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'ISO Format Test' })
      );

      const result = await setConversationContext(db, conversation.conversationId, ['pin_iso']);

      expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('semantic behavior', () => {
    it('null means use all project pins (default behavior)', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Semantic Null Test' })
      );

      const result = await setConversationContext(db, conversation.conversationId, null);

      // null = use all project pins
      expect(result.selected_pin_ids).toBeNull();
    });

    it('empty array means no pins (fresh start)', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Semantic Empty Test' })
      );

      const result = await setConversationContext(db, conversation.conversationId, []);

      // [] = no pins (fresh start)
      expect(result.selected_pin_ids).toEqual([]);
    });

    it('specific IDs means use only those pins', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Semantic Specific Test' })
      );

      const result = await setConversationContext(db, conversation.conversationId, [
        'pin_specific_1',
        'pin_specific_2',
      ]);

      // [...ids] = specific pins only
      expect(result.selected_pin_ids).toEqual(['pin_specific_1', 'pin_specific_2']);
    });
  });
});
