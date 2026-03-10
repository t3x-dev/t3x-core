import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertConversation } from '../queries/conversations';
import {
  deleteDeltaLogEntry,
  getDeltaLogEntry,
  insertDeltaLogEntry,
  listDeltaLogByConversation,
} from '../queries/delta-log';
import { insertProject } from '../queries/projects';
import { createTestDB, sleep, testData } from './setup';

describe('Delta Log Storage', () => {
  let db: AnyDB;
  let _client: PGlite;
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    _client = setup.client;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'DeltaLog Test' }));
    testProjectId = project.projectId;

    const conv = await insertConversation(
      db,
      testData.conversation(testProjectId, { title: 'DL Conv' })
    );
    testConversationId = conv.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // insertDeltaLogEntry + getDeltaLogEntry
  // =========================================================================
  describe('insertDeltaLogEntry', () => {
    it('inserts and retrieves a delta log entry', async () => {
      const delta = { added_entities: [{ id: 'e1', label: 'TypeScript' }] };
      const entry = await insertDeltaLogEntry(db, {
        conversationId: testConversationId,
        projectId: testProjectId,
        source: 'llm_extraction',
        turnHash: 'sha256:abc123',
        delta,
      });

      expect(entry).toBeDefined();
      expect(entry.id).toMatch(/^dl_/);
      expect(entry.id.length).toBe(15); // "dl_" + 12 chars
      expect(entry.conversationId).toBe(testConversationId);
      expect(entry.projectId).toBe(testProjectId);
      expect(entry.source).toBe('llm_extraction');
      expect(entry.turnHash).toBe('sha256:abc123');
      expect(entry.delta).toEqual(delta);
      expect(entry.createdAt).toBeDefined();

      // Retrieve by ID
      const fetched = await getDeltaLogEntry(db, entry.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(entry.id);
      expect(fetched!.delta).toEqual(delta);
    });

    it('inserts entry without optional turnHash', async () => {
      const entry = await insertDeltaLogEntry(db, {
        conversationId: testConversationId,
        projectId: testProjectId,
        source: 'user_graph_edit',
        delta: { removed_relations: [{ id: 'r1' }] },
      });

      expect(entry.turnHash).toBeNull();
      expect(entry.source).toBe('user_graph_edit');
    });

    it('generates unique IDs with dl_ prefix', async () => {
      const entry1 = await insertDeltaLogEntry(db, {
        conversationId: testConversationId,
        projectId: testProjectId,
        source: 'user_yaml_edit',
        delta: { a: 1 },
      });
      const entry2 = await insertDeltaLogEntry(db, {
        conversationId: testConversationId,
        projectId: testProjectId,
        source: 'user_yaml_edit',
        delta: { b: 2 },
      });

      expect(entry1.id).toMatch(/^dl_/);
      expect(entry2.id).toMatch(/^dl_/);
      expect(entry1.id).not.toBe(entry2.id);
    });

    it('preserves source field correctly', async () => {
      for (const source of ['llm_extraction', 'user_graph_edit', 'user_yaml_edit']) {
        const entry = await insertDeltaLogEntry(db, {
          conversationId: testConversationId,
          projectId: testProjectId,
          source,
          delta: {},
        });
        expect(entry.source).toBe(source);
      }
    });
  });

  // =========================================================================
  // getDeltaLogEntry
  // =========================================================================
  describe('getDeltaLogEntry', () => {
    it('returns undefined for non-existent ID', async () => {
      const result = await getDeltaLogEntry(db, 'dl_nonexistent');
      expect(result).toBeUndefined();
    });
  });

  // =========================================================================
  // listDeltaLogByConversation
  // =========================================================================
  describe('listDeltaLogByConversation', () => {
    it('lists entries in chronological order (ASC)', async () => {
      // Create a second conversation for isolation
      const conv2 = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'DL Conv 2' })
      );

      await insertDeltaLogEntry(db, {
        conversationId: conv2.conversationId,
        projectId: testProjectId,
        source: 'llm_extraction',
        delta: { order: 1 },
      });
      await sleep(10);
      await insertDeltaLogEntry(db, {
        conversationId: conv2.conversationId,
        projectId: testProjectId,
        source: 'user_graph_edit',
        delta: { order: 2 },
      });
      await sleep(10);
      await insertDeltaLogEntry(db, {
        conversationId: conv2.conversationId,
        projectId: testProjectId,
        source: 'user_yaml_edit',
        delta: { order: 3 },
      });

      const list = await listDeltaLogByConversation(db, conv2.conversationId);
      expect(list.length).toBe(3);

      // Verify ASC order
      for (let i = 1; i < list.length; i++) {
        expect(new Date(list[i - 1].createdAt!).getTime()).toBeLessThanOrEqual(
          new Date(list[i].createdAt!).getTime()
        );
      }

      // Verify content order
      expect((list[0].delta as { order: number }).order).toBe(1);
      expect((list[2].delta as { order: number }).order).toBe(3);
    });

    it('returns empty array for conversation with no entries', async () => {
      const conv3 = await insertConversation(
        db,
        testData.conversation(testProjectId, { title: 'DL Conv Empty' })
      );
      const list = await listDeltaLogByConversation(db, conv3.conversationId);
      expect(list).toEqual([]);
    });
  });

  // =========================================================================
  // deleteDeltaLogEntry
  // =========================================================================
  describe('deleteDeltaLogEntry', () => {
    it('deletes an entry and returns the deleted record', async () => {
      const entry = await insertDeltaLogEntry(db, {
        conversationId: testConversationId,
        projectId: testProjectId,
        source: 'user_graph_edit',
        delta: { to_delete: true },
      });

      const deleted = await deleteDeltaLogEntry(db, entry.id);
      expect(deleted).toBeDefined();
      expect(deleted!.id).toBe(entry.id);

      // Verify it no longer exists
      const fetched = await getDeltaLogEntry(db, entry.id);
      expect(fetched).toBeUndefined();
    });

    it('returns undefined for non-existent ID', async () => {
      const result = await deleteDeltaLogEntry(db, 'dl_nonexistent');
      expect(result).toBeUndefined();
    });
  });
});
