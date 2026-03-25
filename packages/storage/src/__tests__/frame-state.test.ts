import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertConversation } from '../queries/conversations';
import {
  clearManualEditedFlags,
  deleteFrame,
  deleteFrameRelationsByFrameId,
  deleteFramesByConversation,
  listFrameRelationsByConversation,
  listFramesByConversation,
  upsertFrame,
  upsertFrameRelation,
} from '../queries/frame-state';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

describe('Frame State Queries', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;
  let conversationId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    // Create test project + conversation
    const project = await insertProject(db, testData.project({ name: 'Frame Test' }));
    projectId = project.projectId;
    const conv = await insertConversation(
      db,
      testData.conversation(projectId, { title: 'Frame Conv' })
    );
    conversationId = conv.conversationId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('upserts a frame (insert)', async () => {
    const result = await upsertFrame(db, {
      conversationId,
      frameId: 'f_001',
      projectId,
      type: 'travel_plan',
      slots: { destination: 'Kyoto', budget: '$3000' },
      source: 'pipeline',
    });
    expect(result.frameId).toBe('f_001');
    expect(result.type).toBe('travel_plan');
    expect(result.manualEdited).toBe(false);
  });

  it('upserts a frame (update on conflict)', async () => {
    const result = await upsertFrame(db, {
      conversationId,
      frameId: 'f_001',
      projectId,
      type: 'travel_plan',
      slots: { destination: 'Tokyo', budget: '$5000' },
      source: 'manual',
      manualEdited: true,
    });
    expect(result.frameId).toBe('f_001');
    expect((result.slots as Record<string, string>).destination).toBe('Tokyo');
    expect(result.source).toBe('manual');
    expect(result.manualEdited).toBe(true);
  });

  it('lists frames by conversation', async () => {
    await upsertFrame(db, {
      conversationId,
      frameId: 'f_002',
      projectId,
      type: 'dietary',
      slots: { diet_type: 'vegetarian' },
      source: 'pipeline',
    });
    const list = await listFramesByConversation(db, conversationId);
    expect(list.length).toBe(2);
  });

  it('deletes a frame', async () => {
    const deleted = await deleteFrame(db, conversationId, 'f_002');
    expect(deleted?.frameId).toBe('f_002');
    const list = await listFramesByConversation(db, conversationId);
    expect(list.length).toBe(1);
  });

  it('clears manual_edited flags', async () => {
    // f_001 has manualEdited=true from the upsert test above
    await clearManualEditedFlags(db, conversationId);
    const list = await listFramesByConversation(db, conversationId);
    expect(list[0].manualEdited).toBe(false);
  });

  it('upserts and lists frame relations', async () => {
    await upsertFrame(db, {
      conversationId,
      frameId: 'f_003',
      projectId,
      type: 'activity',
      slots: { name: 'temple visit' },
      source: 'pipeline',
    });
    await upsertFrameRelation(db, {
      conversationId,
      fromFrameId: 'f_001',
      toFrameId: 'f_003',
      type: 'elaborates',
      confidence: 0.9,
    });
    const rels = await listFrameRelationsByConversation(db, conversationId);
    expect(rels.length).toBe(1);
    expect(rels[0].fromFrameId).toBe('f_001');
    expect(rels[0].type).toBe('elaborates');
  });

  it('deletes relations by frame ID', async () => {
    await deleteFrameRelationsByFrameId(db, conversationId, 'f_003');
    const rels = await listFrameRelationsByConversation(db, conversationId);
    expect(rels.length).toBe(0);
  });

  it('deletes all frames by conversation', async () => {
    await deleteFramesByConversation(db, conversationId);
    const list = await listFramesByConversation(db, conversationId);
    expect(list.length).toBe(0);
  });
});
