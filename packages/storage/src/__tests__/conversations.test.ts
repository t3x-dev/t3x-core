/**
 * Conversations Storage Tests
 *
 * Tests all conversation CRUD operations and verifies database effects.
 */

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createCommit, hasConversationCommitReferences } from '../queries/commits';
import {
  deleteConversation,
  findConversationByAliasOrId,
  findConversationById,
  findConversationsByProject,
  getConversationTurnCount,
  insertConversation,
  renameConversation,
  setAliasIfNull,
  updateConversation,
} from '../queries/conversations';
import { insertProject } from '../queries/projects';
import { insertTurn } from '../queries/turns';
import { type Conversation, conversations } from '../schema';
import { createTestDB, testData } from './setup';

describe('Conversations Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
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

    describe('alias column', () => {
      it('stores and retrieves an alias', async () => {
        const result = await insertConversation(db, { projectId: testProjectId });

        // Manually update via raw Drizzle since insertConversation does not yet take alias
        await db
          .update(conversations)
          .set({ alias: 'tokyo_trip' })
          .where(eq(conversations.conversationId, result.conversationId));

        const [row] = await db
          .select()
          .from(conversations)
          .where(eq(conversations.conversationId, result.conversationId));

        expect(row.alias).toBe('tokyo_trip');
      });

      it('enforces (project_id, alias) uniqueness', async () => {
        const a = await insertConversation(db, { projectId: testProjectId });
        const b = await insertConversation(db, { projectId: testProjectId });

        await db
          .update(conversations)
          .set({ alias: 'duplicate_alias' })
          .where(eq(conversations.conversationId, a.conversationId));

        await expect(
          db
            .update(conversations)
            .set({ alias: 'duplicate_alias' })
            .where(eq(conversations.conversationId, b.conversationId))
        ).rejects.toThrow();
      });

      it('allows the same alias under different projects', async () => {
        const otherProject = await insertProject(db, testData.project({ name: 'Other Project' }));
        const c1 = await insertConversation(db, { projectId: testProjectId });
        const c2 = await insertConversation(db, { projectId: otherProject.projectId });

        await db
          .update(conversations)
          .set({ alias: 'shared_name' })
          .where(eq(conversations.conversationId, c1.conversationId));
        await db
          .update(conversations)
          .set({ alias: 'shared_name' })
          .where(eq(conversations.conversationId, c2.conversationId));

        const rows = await db
          .select()
          .from(conversations)
          .where(eq(conversations.alias, 'shared_name'));

        expect(rows).toHaveLength(2);
      });

      describe('alias format constraint', () => {
        // Negative cases: each must be rejected by the
        // `conversations_alias_format` CHECK constraint.
        // Regex: ^[a-z][a-z0-9_]{0,63}$
        it('rejects uppercase letters', async () => {
          const conv = await insertConversation(db, { projectId: testProjectId });

          await expect(
            db
              .update(conversations)
              .set({ alias: 'Tokyo_Trip' })
              .where(eq(conversations.conversationId, conv.conversationId))
          ).rejects.toThrow();
        });

        it('rejects aliases starting with a digit', async () => {
          const conv = await insertConversation(db, { projectId: testProjectId });

          await expect(
            db
              .update(conversations)
              .set({ alias: '1tokyo_trip' })
              .where(eq(conversations.conversationId, conv.conversationId))
          ).rejects.toThrow();
        });

        it('rejects hyphens', async () => {
          const conv = await insertConversation(db, { projectId: testProjectId });

          await expect(
            db
              .update(conversations)
              .set({ alias: 'tokyo-trip' })
              .where(eq(conversations.conversationId, conv.conversationId))
          ).rejects.toThrow();
        });

        it('rejects whitespace', async () => {
          const conv = await insertConversation(db, { projectId: testProjectId });

          await expect(
            db
              .update(conversations)
              .set({ alias: 'tokyo trip' })
              .where(eq(conversations.conversationId, conv.conversationId))
          ).rejects.toThrow();
        });

        it('rejects empty string', async () => {
          const conv = await insertConversation(db, { projectId: testProjectId });

          await expect(
            db
              .update(conversations)
              .set({ alias: '' })
              .where(eq(conversations.conversationId, conv.conversationId))
          ).rejects.toThrow();
        });

        it('rejects aliases longer than 64 characters', async () => {
          const conv = await insertConversation(db, { projectId: testProjectId });
          // 65 chars: 'a' + 64 'b's = 65 total
          const tooLong = `a${'b'.repeat(64)}`;
          expect(tooLong.length).toBe(65);

          await expect(
            db
              .update(conversations)
              .set({ alias: tooLong })
              .where(eq(conversations.conversationId, conv.conversationId))
          ).rejects.toThrow();
        });

        // Positive boundary cases — must be accepted by the constraint.
        it('accepts a single lowercase letter (1 char minimum)', async () => {
          const conv = await insertConversation(db, { projectId: testProjectId });

          await db
            .update(conversations)
            .set({ alias: 'a' })
            .where(eq(conversations.conversationId, conv.conversationId));

          const [row] = await db
            .select()
            .from(conversations)
            .where(eq(conversations.conversationId, conv.conversationId));

          expect(row.alias).toBe('a');
        });

        it('accepts letter + underscore + digit', async () => {
          const conv = await insertConversation(db, { projectId: testProjectId });

          await db
            .update(conversations)
            .set({ alias: 'a_1' })
            .where(eq(conversations.conversationId, conv.conversationId));

          const [row] = await db
            .select()
            .from(conversations)
            .where(eq(conversations.conversationId, conv.conversationId));

          expect(row.alias).toBe('a_1');
        });

        it('accepts a 64-character alias at the upper boundary', async () => {
          const conv = await insertConversation(db, { projectId: testProjectId });
          // 64 chars: 'a' + 63 'b's = 64 total
          const maxAlias = `a${'b'.repeat(63)}`;
          expect(maxAlias.length).toBe(64);

          await db
            .update(conversations)
            .set({ alias: maxAlias })
            .where(eq(conversations.conversationId, conv.conversationId));

          const [row] = await db
            .select()
            .from(conversations)
            .where(eq(conversations.conversationId, conv.conversationId));

          expect(row.alias).toBe(maxAlias);
        });
      });
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

    it('updates the parent commit hash', async () => {
      const created = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Branch Draft' })
      );

      const updated = await updateConversation(db, created.conversationId, {
        parentCommitHash: 'sha256:branch_head',
      });

      expect(updated).toBeDefined();
      expect(updated!.parentCommitHash).toBe('sha256:branch_head');

      const cleared = await updateConversation(db, created.conversationId, {
        parentCommitHash: null,
      });

      expect(cleared).toBeDefined();
      expect(cleared!.parentCommitHash).toBeNull();
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

  describe('hasConversationCommitReferences', () => {
    it('returns true when a commit source references the conversation', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Committed Source' })
      );

      await createCommit(db, {
        project_id: testProjectId,
        author: { type: 'human', name: 'Tester' },
        content: {
          trees: [{ key: 'source', slots: { text: 'Conversation source' }, children: [] }],
          relations: [],
        },
        sources: [
          {
            type: 'conversation',
            id: conversation.conversationId,
            title: conversation.title ?? undefined,
          },
        ],
      });

      await expect(hasConversationCommitReferences(db, conversation.conversationId)).resolves.toBe(
        true
      );
    });

    it('returns false when no commit source references the conversation', async () => {
      const conversation = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'Uncommitted Source' })
      );

      await expect(hasConversationCommitReferences(db, conversation.conversationId)).resolves.toBe(
        false
      );
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

  describe('cursor pagination — findConversationsByProject', () => {
    it('returns CursorPage for first page with cursor=""', async () => {
      const proj = await insertProject(db, testData.project({ name: 'Conv Cursor First Page' }));

      for (let i = 0; i < 5; i++) {
        await insertConversation(db, {
          projectId: proj.projectId,
          title: `Cursor Conv ${i}`,
        });
        await new Promise((r) => setTimeout(r, 5));
      }

      const page = await findConversationsByProject(db, {
        projectId: proj.projectId,
        cursor: '',
        limit: 2,
      });

      expect(page.items).toHaveLength(2);
      expect(page.has_more).toBe(true);
      expect(page.next_cursor).toBeTruthy();
    });

    it('follows cursor through all pages', async () => {
      const proj = await insertProject(db, testData.project({ name: 'Conv Cursor Follow' }));

      for (let i = 0; i < 5; i++) {
        await insertConversation(db, {
          projectId: proj.projectId,
          title: `Follow Conv ${i}`,
        });
        await new Promise((r) => setTimeout(r, 5));
      }

      // Page 1
      const page1 = await findConversationsByProject(db, {
        projectId: proj.projectId,
        cursor: '',
        limit: 2,
      });
      expect(page1.items).toHaveLength(2);
      expect(page1.has_more).toBe(true);

      // Page 2
      const page2 = await findConversationsByProject(db, {
        projectId: proj.projectId,
        cursor: page1.next_cursor!,
        limit: 2,
      });
      expect(page2.items).toHaveLength(2);
      expect(page2.has_more).toBe(true);

      // Page 3 (last page, 1 remaining)
      const page3 = await findConversationsByProject(db, {
        projectId: proj.projectId,
        cursor: page2.next_cursor!,
        limit: 2,
      });
      expect(page3.items).toHaveLength(1);
      expect(page3.has_more).toBe(false);
      expect(page3.next_cursor).toBeNull();

      // All items are unique
      const allItems = [...page1.items, ...page2.items, ...page3.items];
      expect(allItems).toHaveLength(5);
      const ids = new Set(allItems.map((c) => c.conversationId));
      expect(ids.size).toBe(5);
    });

    it('returns empty page for project with no conversations', async () => {
      const proj = await insertProject(db, testData.project({ name: 'Conv Cursor Empty' }));

      const page = await findConversationsByProject(db, {
        projectId: proj.projectId,
        cursor: '',
        limit: 10,
      });

      expect(page.items).toHaveLength(0);
      expect(page.has_more).toBe(false);
      expect(page.next_cursor).toBeNull();
    });

    it('still returns plain array without cursor (backward compat)', async () => {
      const proj = await insertProject(db, testData.project({ name: 'Conv Cursor Compat' }));

      await insertConversation(db, {
        projectId: proj.projectId,
        title: 'Compat Conv',
      });

      const result = await findConversationsByProject(db, {
        projectId: proj.projectId,
      });

      expect(Array.isArray(result)).toBe(true);
      expect((result as Conversation[]).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('findConversationByAliasOrId', () => {
    it('finds by conversation_id', async () => {
      const created = await insertConversation(db, { projectId: testProjectId });

      const found = await findConversationByAliasOrId(db, testProjectId, created.conversationId);

      expect(found).not.toBeNull();
      expect(found?.conversationId).toBe(created.conversationId);
    });

    it('finds by alias scoped to project', async () => {
      const created = await insertConversation(db, { projectId: testProjectId });
      await db
        .update(conversations)
        .set({ alias: 'lookup_me' })
        .where(eq(conversations.conversationId, created.conversationId));

      const found = await findConversationByAliasOrId(db, testProjectId, 'lookup_me');

      expect(found?.conversationId).toBe(created.conversationId);
    });

    it('returns null when alias does not exist in project', async () => {
      const found = await findConversationByAliasOrId(db, testProjectId, 'nonexistent_alias');

      expect(found).toBeNull();
    });
  });

  describe('setAliasIfNull', () => {
    it('sets the base alias when row.alias is NULL and no collision', async () => {
      const created = await insertConversation(db, { projectId: testProjectId });

      const result = await setAliasIfNull(db, created.conversationId, 'fresh_topic');

      expect(result).toBe('fresh_topic');
    });

    it('appends _2 when base alias is already taken in same project', async () => {
      const a = await insertConversation(db, { projectId: testProjectId });
      const b = await insertConversation(db, { projectId: testProjectId });

      await setAliasIfNull(db, a.conversationId, 'collide');
      const result = await setAliasIfNull(db, b.conversationId, 'collide');

      expect(result).toBe('collide_2');
    });

    it('returns existing alias when row already has one (no overwrite)', async () => {
      const created = await insertConversation(db, { projectId: testProjectId });
      await db
        .update(conversations)
        .set({ alias: 'already_set' })
        .where(eq(conversations.conversationId, created.conversationId));

      const result = await setAliasIfNull(db, created.conversationId, 'new_attempt');

      expect(result).toBe('already_set');
    });
  });

  describe('renameConversation', () => {
    it('updates alias on a conversation', async () => {
      const created = await insertConversation(db, { projectId: testProjectId });

      await renameConversation(db, created.conversationId, 'manual_rename');

      const [row] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.conversationId, created.conversationId));
      expect(row.alias).toBe('manual_rename');
    });

    it('throws on invalid alias format', async () => {
      const created = await insertConversation(db, { projectId: testProjectId });

      await expect(renameConversation(db, created.conversationId, 'BadAlias')).rejects.toThrow(
        /format/
      );
    });

    it('throws on collision within the same project', async () => {
      const a = await insertConversation(db, { projectId: testProjectId });
      const b = await insertConversation(db, { projectId: testProjectId });

      await renameConversation(db, a.conversationId, 'taken_name');

      await expect(renameConversation(db, b.conversationId, 'taken_name')).rejects.toThrow();
    });
  });
});
