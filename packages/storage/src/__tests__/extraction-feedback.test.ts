import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { insertProject } from '../queries/projects';
import {
  getExtractionFeedbackStats,
  insertExtractionFeedback,
  listExtractionFeedback,
} from '../queries/extraction-feedback';
import type { AnyDB } from '../adapters';
import { createTestDB } from './setup';

describe('extraction feedback (L4)', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const env = await createTestDB();
    db = env.db;
    cleanup = env.cleanup;

    const project = await insertProject(db, { name: 'EF Test' });
    projectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('inserts feedback record', async () => {
    await insertExtractionFeedback(db, {
      id: 'ef_001',
      project_id: projectId,
      draft_id: 'draft_1',
      sp_id: 'sp_abc',
      action: 'accept',
      inference_type: 'direct',
      confidence: 0.92,
      zone: 'ready',
    });

    const list = await listExtractionFeedback(db, projectId);
    expect(list).toHaveLength(1);
    expect(list[0].action).toBe('accept');
    expect(list[0].spId).toBe('sp_abc');
  });

  it('retrieves feedback stats grouped by inference type', async () => {
    await insertExtractionFeedback(db, {
      id: 'ef_002',
      project_id: projectId,
      draft_id: 'draft_1',
      sp_id: 'sp_def',
      action: 'undo',
      inference_type: 'direct',
      confidence: 0.88,
      zone: 'ready',
    });
    await insertExtractionFeedback(db, {
      id: 'ef_003',
      project_id: projectId,
      draft_id: 'draft_1',
      sp_id: 'sp_ghi',
      action: 'edit',
      inference_type: 'inference',
      confidence: 0.70,
      zone: 'review',
      edited_text: 'Corrected text',
    });

    const stats = await getExtractionFeedbackStats(db, projectId);
    expect(stats.total).toBe(3);
    expect(stats.by_action.accept).toBe(1);
    expect(stats.by_action.undo).toBe(1);
    expect(stats.by_action.edit).toBe(1);
    expect(stats.by_inference_type.direct.accept).toBe(1);
    expect(stats.by_inference_type.direct.undo).toBe(1);
    expect(stats.by_inference_type.inference.edit).toBe(1);
  });

  it('filters by draft_id', async () => {
    await insertExtractionFeedback(db, {
      id: 'ef_004',
      project_id: projectId,
      draft_id: 'draft_2',
      sp_id: 'sp_jkl',
      action: 'reject',
      inference_type: 'paraphrase',
      confidence: 0.50,
      zone: 'review',
    });

    const draft1 = await listExtractionFeedback(db, projectId, { draftId: 'draft_1' });
    const draft2 = await listExtractionFeedback(db, projectId, { draftId: 'draft_2' });
    expect(draft1).toHaveLength(3);
    expect(draft2).toHaveLength(1);
    expect(draft2[0].action).toBe('reject');
  });

  it('returns empty stats for project with no feedback', async () => {
    const stats = await getExtractionFeedbackStats(db, 'proj_nonexistent');
    expect(stats.total).toBe(0);
    expect(stats.by_action).toEqual({});
    expect(stats.by_inference_type).toEqual({});
  });
});
