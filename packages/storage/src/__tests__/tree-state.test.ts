import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertConversation } from '../queries/conversations';
import {
  clearManualEditedFlags,
  deleteTree,
  deleteTreeRelationsByTreeId,
  deleteTreesByConversation,
  listTreeRelationsByConversation,
  listTreesByConversation,
  upsertTree,
  upsertTreeRelation,
} from '../queries/tree-state';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

describe('Tree State Queries', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;
  let conversationId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    // Create test project + conversation
    const project = await insertProject(db, testData.project({ name: 'Tree Test' }));
    projectId = project.projectId;
    const conv = await insertConversation(
      db,
      testData.conversation(projectId, { title: 'Tree Conv' })
    );
    conversationId = conv.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('upserts a tree (insert)', async () => {
    const result = await upsertTree(db, {
      conversationId,
      treeId: 'f_001',
      projectId,
      type: 'travel_plan',
      slots: { destination: 'Kyoto', budget: '$3000' },
      source: 'pipeline',
    });
    expect(result.treeId).toBe('f_001');
    expect(result.type).toBe('travel_plan');
    expect(result.manualEdited).toBe(false);
  });

  it('upserts a tree (update on conflict)', async () => {
    const result = await upsertTree(db, {
      conversationId,
      treeId: 'f_001',
      projectId,
      type: 'travel_plan',
      slots: { destination: 'Tokyo', budget: '$5000' },
      source: 'manual',
      manualEdited: true,
    });
    expect(result.treeId).toBe('f_001');
    expect((result.slots as Record<string, string>).destination).toBe('Tokyo');
    expect(result.source).toBe('manual');
    expect(result.manualEdited).toBe(true);
  });

  it('lists trees by conversation', async () => {
    await upsertTree(db, {
      conversationId,
      treeId: 'f_002',
      projectId,
      type: 'dietary',
      slots: { diet_type: 'vegetarian' },
      source: 'pipeline',
    });
    const list = await listTreesByConversation(db, conversationId);
    expect(list.length).toBe(2);
  });

  it('deletes a tree', async () => {
    const deleted = await deleteTree(db, conversationId, 'f_002');
    expect(deleted?.treeId).toBe('f_002');
    const list = await listTreesByConversation(db, conversationId);
    expect(list.length).toBe(1);
  });

  it('clears manual_edited flags', async () => {
    // f_001 has manualEdited=true from the upsert test above
    await clearManualEditedFlags(db, conversationId);
    const list = await listTreesByConversation(db, conversationId);
    expect(list[0].manualEdited).toBe(false);
  });

  it('upserts and lists tree relations', async () => {
    await upsertTree(db, {
      conversationId,
      treeId: 'f_003',
      projectId,
      type: 'activity',
      slots: { name: 'temple visit' },
      source: 'pipeline',
    });
    await upsertTreeRelation(db, {
      conversationId,
      fromTreeId: 'f_001',
      toTreeId: 'f_003',
      type: 'elaborates',
    });
    const rels = await listTreeRelationsByConversation(db, conversationId);
    expect(rels.length).toBe(1);
    expect(rels[0].fromTreeId).toBe('f_001');
    expect(rels[0].type).toBe('elaborates');
  });

  it('deletes relations by tree ID', async () => {
    await deleteTreeRelationsByTreeId(db, conversationId, 'f_003');
    const rels = await listTreeRelationsByConversation(db, conversationId);
    expect(rels.length).toBe(0);
  });

  it('deletes all trees by conversation', async () => {
    await deleteTreesByConversation(db, conversationId);
    const list = await listTreesByConversation(db, conversationId);
    expect(list.length).toBe(0);
  });
});
