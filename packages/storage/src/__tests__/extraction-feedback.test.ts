import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  getAdaptiveFeedbackStats,
  getExtractionFeedbackStats,
  insertExtractionFeedback,
  listExtractionFeedback,
} from '../queries/extraction-feedback';
import { insertProject } from '../queries/projects';
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
      zone: 'ready',
    });
    await insertExtractionFeedback(db, {
      id: 'ef_003',
      project_id: projectId,
      draft_id: 'draft_1',
      sp_id: 'sp_ghi',
      action: 'edit',
      inference_type: 'inference',
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

  it('inserts feedback with originalText and lowCoverage', async () => {
    await insertExtractionFeedback(db, {
      id: 'ef_005',
      project_id: projectId,
      draft_id: 'draft_3',
      sp_id: 'sp_mno',
      action: 'edit',
      original_text: 'Original sentence text',
      inference_type: 'cross_turn',
      zone: 'review',
      low_coverage: true,
      edited_text: 'Corrected sentence text',
    });

    const list = await listExtractionFeedback(db, projectId, { draftId: 'draft_3' });
    expect(list).toHaveLength(1);
    expect(list[0].originalText).toBe('Original sentence text');
    expect(list[0].lowCoverage).toBe(true);
    expect(list[0].editedText).toBe('Corrected sentence text');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getAdaptiveFeedbackStats
// ═══════════════════════════════════════════════════════════════════════════

describe('getAdaptiveFeedbackStats', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const env = await createTestDB();
    db = env.db;
    cleanup = env.cleanup;

    const project = await insertProject(db, { name: 'Adaptive Stats Test' });
    projectId = project.projectId;

    // Insert varied feedback data
    const entries = [
      { id: 'aef_01', action: 'accept' as const, inference_type: 'direct' },
      { id: 'aef_02', action: 'accept' as const, inference_type: 'direct' },
      { id: 'aef_03', action: 'edit' as const, inference_type: 'direct' },
      { id: 'aef_04', action: 'reject' as const, inference_type: 'paraphrase' },
      { id: 'aef_05', action: 'accept' as const, inference_type: 'paraphrase' },
      { id: 'aef_06', action: 'undo' as const, inference_type: 'direct' },
    ];

    for (const e of entries) {
      await insertExtractionFeedback(db, {
        ...e,
        project_id: projectId,
        draft_id: 'draft_a',
        sp_id: `sp_${e.id}`,
        zone: 'ready',
      });
    }
  });

  afterAll(async () => {
    await cleanup();
  });

  it('returns per-inference-type accept/edit/reject counts', async () => {
    const stats = await getAdaptiveFeedbackStats(db, projectId);

    expect(stats.byInferenceType.direct.total).toBe(4); // 2 accept + 1 edit + 1 undo
    expect(stats.byInferenceType.direct.accepted).toBe(2);
    expect(stats.byInferenceType.direct.edited).toBe(1);
    expect(stats.byInferenceType.direct.rejected).toBe(0);

    expect(stats.byInferenceType.paraphrase.total).toBe(2);
    expect(stats.byInferenceType.paraphrase.accepted).toBe(1);
    expect(stats.byInferenceType.paraphrase.rejected).toBe(1);
  });

  it('returns overall rates excluding undo actions', async () => {
    const stats = await getAdaptiveFeedbackStats(db, projectId);

    // Undo is excluded from rate calculations
    // Counted: 2 accept(direct) + 1 edit(direct) + 1 reject(para) + 1 accept(para) = 5
    expect(stats.overall.total).toBe(5);
    expect(stats.overall.acceptRate).toBeCloseTo(3 / 5);
    expect(stats.overall.editRate).toBeCloseTo(1 / 5);
    expect(stats.overall.rejectRate).toBeCloseTo(1 / 5);
  });

  it('returns zero rates for empty project', async () => {
    const stats = await getAdaptiveFeedbackStats(db, 'proj_empty');
    expect(stats.overall.total).toBe(0);
    expect(stats.overall.acceptRate).toBe(0);
    expect(stats.overall.editRate).toBe(0);
    expect(stats.overall.rejectRate).toBe(0);
    expect(stats.byInferenceType).toEqual({});
  });
});

