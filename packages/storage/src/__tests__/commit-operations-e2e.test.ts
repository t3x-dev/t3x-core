/**
 * Commit Operations E2E Tests
 *
 * Full lifecycle: insert yops -> create commit with yops_log_ids -> query operations.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createCommit, getCommit } from '../queries/commits';
import { insertConversation } from '../queries/conversations';
import { insertProject } from '../queries/projects';
import { getYOpsForCommit, insertYOpsLogEntry } from '../queries/yops-log';
import { createTestDB, sleep, testData } from './setup';

describe('Commit Operations E2E', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testConversationId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Commit Ops E2E' }));
    testProjectId = project.projectId;

    const conversation = await insertConversation(db, testData.conversation(testProjectId));
    testConversationId = conversation.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('full cycle: insert yops -> create commit -> query operations', async () => {
    // yops_log_source_required CHECK demands a per-op source; legacy
    // fixtures used inline `source: 'about 5000'` strings inside `set`
    // (a different concept), which never satisfied the per-op contract.
    const src = { type: 'human' as const, author: 'test', at: '2026-04-25T00:00:00.000Z' };

    // 1. Insert two yops_log entries for a conversation
    const entry1 = await insertYOpsLogEntry(db, {
      conversationId: testConversationId,
      projectId: testProjectId,
      source: 'pipeline',
      yops: [{ set: { path: 'trip/budget', value: 5000 }, source: src }],
    });

    await sleep(50);

    const entry2 = await insertYOpsLogEntry(db, {
      conversationId: testConversationId,
      projectId: testProjectId,
      source: 'manual',
      yops: [{ set: { path: 'trip/style', value: 'casual' }, source: src }],
    });

    // 2. Create commit with yops_log_ids
    const commit = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: {
        trees: [{ key: 'trip', slots: { budget: 5000, style: 'casual' }, children: [] }],
        relations: [],
      },
      project_id: testProjectId,
      message: 'test commit',
      yops_log_ids: [entry1.id, entry2.id],
    });

    // 3. Verify commit has yops_log_ids
    expect(commit.yops_log_ids).toEqual([entry1.id, entry2.id]);

    // 4. Verify commit persisted with yops_log_ids
    const retrieved = await getCommit(db, commit.hash);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.yops_log_ids).toEqual([entry1.id, entry2.id]);

    // 5. Query operations
    const ops = await getYOpsForCommit(db, commit.yops_log_ids);
    expect(ops).toHaveLength(2);
    expect(ops[0].source).toBe('pipeline');
    expect(ops[1].source).toBe('manual');

    // 6. Verify operations contain the actual yops data
    expect(ops[0].yops).toEqual([{ set: { path: 'trip/budget', value: 5000 }, source: src }]);
  });

  it('merge commit has empty yops_log_ids', async () => {
    const commit = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [], relations: [] },
      project_id: testProjectId,
      parents: [],
      message: 'merge commit',
      provenance: { method: 'merge' },
      yops_log_ids: [],
    });
    expect(commit.yops_log_ids).toEqual([]);

    const ops = await getYOpsForCommit(db, commit.yops_log_ids);
    expect(ops).toEqual([]);
  });

  it('commit without yops_log_ids defaults to empty', async () => {
    const commit = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: {
        trees: [{ key: 'no_yops', slots: { data: 'test' }, children: [] }],
        relations: [],
      },
      project_id: testProjectId,
      message: 'no yops commit',
    });
    expect(commit.yops_log_ids).toEqual([]);
  });
});
