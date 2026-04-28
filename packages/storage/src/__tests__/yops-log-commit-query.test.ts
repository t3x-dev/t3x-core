/**
 * getYOpsForCommit Tests
 *
 * Verifies the query that looks up yops entries by their IDs.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createCommit } from '../queries/commits';
import { insertConversation } from '../queries/conversations';
import { insertProject } from '../queries/projects';
import {
  findCommitHashesByYOpsLogIds,
  getYOpsForCommit,
  insertYOpsLogEntry,
} from '../queries/yops-log';
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
    // yops_log_source_required CHECK demands an array of sourced ops; the
    // legacy `{ changes: [...] }` shape was schema drift that the constraint
    // now (correctly) rejects.
    const src = { type: 'human' as const, author: 'test', at: '2026-04-25T00:00:00.000Z' };
    const entry1 = await insertYOpsLogEntry(db, {
      conversationId: testConversationId,
      projectId: testProjectId,
      source: 'pipeline',
      yops: [{ define: { path: 'a' }, source: src }],
    });

    await sleep(50);

    const entry2 = await insertYOpsLogEntry(db, {
      conversationId: testConversationId,
      projectId: testProjectId,
      source: 'manual',
      yops: [{ define: { path: 'b' }, source: src }],
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

  it('groups commit hashes by yops_log id within the project', async () => {
    const src = { type: 'human' as const, author: 'test', at: '2026-04-25T00:00:00.000Z' };
    const entry = await insertYOpsLogEntry(db, {
      conversationId: testConversationId,
      projectId: testProjectId,
      source: 'manual',
      yops: [{ define: { path: 'shared' }, source: src }],
    });
    const first = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'first', slots: {}, children: [] }], relations: [] },
      project_id: testProjectId,
      message: 'first',
      yops_log_ids: [entry.id],
    });
    const second = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'second', slots: {}, children: [] }], relations: [] },
      project_id: testProjectId,
      message: 'second',
      yops_log_ids: [entry.id],
    });

    const committedBy = await findCommitHashesByYOpsLogIds(db, testProjectId, [entry.id]);

    expect(new Set(committedBy.get(entry.id))).toEqual(new Set([first.hash, second.hash]));
  });

  it('does not return commit references from a different project', async () => {
    const otherProject = await insertProject(db, testData.project({ name: 'Other Project' }));
    const otherConversation = await insertConversation(
      db,
      testData.conversation(otherProject.projectId)
    );
    const src = { type: 'human' as const, author: 'test', at: '2026-04-25T00:00:00.000Z' };
    const entry = await insertYOpsLogEntry(db, {
      conversationId: otherConversation.conversationId,
      projectId: otherProject.projectId,
      source: 'manual',
      yops: [{ define: { path: 'other' }, source: src }],
    });
    await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'other', slots: {}, children: [] }], relations: [] },
      project_id: otherProject.projectId,
      message: 'other',
      yops_log_ids: [entry.id],
    });

    const committedBy = await findCommitHashesByYOpsLogIds(db, testProjectId, [entry.id]);

    expect(committedBy.get(entry.id)).toBeUndefined();
  });
});
