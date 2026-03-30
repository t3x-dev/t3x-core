import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertConversation } from '../queries/conversations';
import {
  deleteYOpsLogEntry,
  getYOpsLogEntry,
  insertYOpsLogEntry,
  listYOpsLogByConversation,
} from '../queries/yops-log';
import { insertProject } from '../queries/projects';
import { createTestDB, sleep, testData } from './setup';

describe('YOps Log Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'YOpsLog Test' }));
    testProjectId = project.projectId;

    const conv = await insertConversation(
      db,
      testData.conversation(testProjectId, { title: 'YL Conv' })
    );
    testConversationId = conv.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // insertYOpsLogEntry + getYOpsLogEntry
  // =========================================================================
  describe('insertYOpsLogEntry', () => {
    it('inserts and retrieves a yops log entry', async () => {
      const yops = { added_entities: [{ id: 'e1', label: 'TypeScript' }] };
      const entry = await insertYOpsLogEntry(db, {
        conversationId: testConversationId,
        projectId: testProjectId,
        source: 'pipeline',
        turnHash: 'sha256:abc123',
        yops,
      });

      expect(entry).toBeDefined();
      expect(entry.id).toMatch(/^yl_/);
      expect(entry.id.length).toBe(15); // "yl_" + 12 chars
      expect(entry.conversationId).toBe(testConversationId);
      expect(entry.projectId).toBe(testProjectId);
      expect(entry.source).toBe('pipeline');
      expect(entry.turnHash).toBe('sha256:abc123');
      expect(entry.yops).toEqual(yops);
      expect(entry.createdAt).toBeDefined();

      // Retrieve by ID
      const fetched = await getYOpsLogEntry(db, entry.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(entry.id);
      expect(fetched!.yops).toEqual(yops);
    });

    it('inserts entry without optional turnHash', async () => {
      const entry = await insertYOpsLogEntry(db, {
        conversationId: testConversationId,
        projectId: testProjectId,
        source: 'manual',
        yops: { removed_relations: [{ id: 'r1' }] },
      });

      expect(entry.turnHash).toBeNull();
      expect(entry.source).toBe('manual');
    });

    it('generates unique IDs with yl_ prefix', async () => {
      const entry1 = await insertYOpsLogEntry(db, {
        conversationId: testConversationId,
        projectId: testProjectId,
        source: 'manual',
        yops: { a: 1 },
      });
      const entry2 = await insertYOpsLogEntry(db, {
        conversationId: testConversationId,
        projectId: testProjectId,
        source: 'manual',
        yops: { b: 2 },
      });

      expect(entry1.id).toMatch(/^yl_/);
      expect(entry2.id).toMatch(/^yl_/);
      expect(entry1.id).not.toBe(entry2.id);
    });

    it('preserves source field correctly', async () => {
      for (const source of ['pipeline', 'manual', 'answer', 'collapse']) {
        const entry = await insertYOpsLogEntry(db, {
          conversationId: testConversationId,
          projectId: testProjectId,
          source,
          yops: {},
        });
        expect(entry.source).toBe(source);
      }
    });
  });

  // =========================================================================
  // getYOpsLogEntry
  // =========================================================================
  describe('getYOpsLogEntry', () => {
    it('returns undefined for non-existent ID', async () => {
      const result = await getYOpsLogEntry(db, 'yl_nonexistent');
      expect(result).toBeUndefined();
    });
  });

  // =========================================================================
  // listYOpsLogByConversation
  // =========================================================================
  describe('listYOpsLogByConversation', () => {
    it('lists entries in chronological order (ASC)', async () => {
      // Create a second conversation for isolation
      const conv2 = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'YL Conv 2' })
      );

      await insertYOpsLogEntry(db, {
        conversationId: conv2.conversationId,
        projectId: testProjectId,
        source: 'pipeline',
        yops: { order: 1 },
      });
      await sleep(10);
      await insertYOpsLogEntry(db, {
        conversationId: conv2.conversationId,
        projectId: testProjectId,
        source: 'manual',
        yops: { order: 2 },
      });
      await sleep(10);
      await insertYOpsLogEntry(db, {
        conversationId: conv2.conversationId,
        projectId: testProjectId,
        source: 'manual',
        yops: { order: 3 },
      });

      const list = await listYOpsLogByConversation(db, conv2.conversationId);
      expect(list.length).toBe(3);

      // Verify ASC order
      for (let i = 1; i < list.length; i++) {
        expect(new Date(list[i - 1].createdAt!).getTime()).toBeLessThanOrEqual(
          new Date(list[i].createdAt!).getTime()
        );
      }

      // Verify content order
      expect((list[0].yops as { order: number }).order).toBe(1);
      expect((list[2].yops as { order: number }).order).toBe(3);
    });

    it('returns empty array for conversation with no entries', async () => {
      const conv3 = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'YL Conv Empty' })
      );
      const list = await listYOpsLogByConversation(db, conv3.conversationId);
      expect(list).toEqual([]);
    });
  });

  // =========================================================================
  // deleteYOpsLogEntry
  // =========================================================================
  describe('deleteYOpsLogEntry', () => {
    it('deletes an entry and returns the deleted record', async () => {
      const entry = await insertYOpsLogEntry(db, {
        conversationId: testConversationId,
        projectId: testProjectId,
        source: 'manual',
        yops: { to_delete: true },
      });

      const deleted = await deleteYOpsLogEntry(db, entry.id);
      expect(deleted).toBeDefined();
      expect(deleted!.id).toBe(entry.id);

      // Verify it no longer exists
      const fetched = await getYOpsLogEntry(db, entry.id);
      expect(fetched).toBeUndefined();
    });

    it('returns undefined for non-existent ID', async () => {
      const result = await deleteYOpsLogEntry(db, 'yl_nonexistent');
      expect(result).toBeUndefined();
    });
  });
});
