/**
 * getYOpsForCommit Tests
 *
 * Verifies the query that looks up yops entries by their IDs.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertConversation } from '../queries/conversations';
import { insertProject } from '../queries/projects';
import { getYOpsForCommit, insertYOpsLogEntry } from '../queries/yops-log';
import { createTestDB, sleep, testData } from './setup';

describe('getYOpsForCommit', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'YOps Commit Query Test' }));
    testProjectId = project.projectId;

    const conversation = await insertConversation(db, testData.conversation(testProjectId));
    testConversationId = conversation.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('returns yops entries by IDs in order', async () => {
    const entry1 = await insertYOpsLogEntry(db, {
      conversationId: testConversationId,
      projectId: testProjectId,
      source: 'pipeline',
      yops: { changes: [{ action: 'add', parent_path: '', node: { key: 'a', slots: { v: '1' }, children: [] } }] },
    });

    await sleep(50);

    const entry2 = await insertYOpsLogEntry(db, {
      conversationId: testConversationId,
      projectId: testProjectId,
      source: 'manual',
      yops: { changes: [{ action: 'add', parent_path: '', node: { key: 'b', slots: { v: '2' }, children: [] } }] },
    });

    const results = await getYOpsForCommit(db, [entry1.id, entry2.id]);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe(entry1.id);
    expect(results[1].id).toBe(entry2.id);
  });

  it('returns empty array for empty IDs', async () => {
    const results = await getYOpsForCommit(db, []);
    expect(results).toEqual([]);
  });
});
