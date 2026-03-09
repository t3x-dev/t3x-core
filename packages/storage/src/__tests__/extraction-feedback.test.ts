import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  getAdaptiveFeedbackStats,
  getExtractionFeedbackStats,
  getFeedbackByCosineBucket,
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
      confidence: 0.7,
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
      confidence: 0.5,
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
      confidence: 0.65,
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
      { id: 'aef_01', action: 'accept' as const, inference_type: 'direct', confidence: 0.95 },
      { id: 'aef_02', action: 'accept' as const, inference_type: 'direct', confidence: 0.92 },
      { id: 'aef_03', action: 'edit' as const, inference_type: 'direct', confidence: 0.85 },
      { id: 'aef_04', action: 'reject' as const, inference_type: 'paraphrase', confidence: 0.6 },
      { id: 'aef_05', action: 'accept' as const, inference_type: 'paraphrase', confidence: 0.7 },
      { id: 'aef_06', action: 'undo' as const, inference_type: 'direct', confidence: 0.8 },
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

// ═══════════════════════════════════════════════════════════════════════════
// getFeedbackByCosineBucket
// ═══════════════════════════════════════════════════════════════════════════

describe('getFeedbackByCosineBucket', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const env = await createTestDB();
    db = env.db;
    cleanup = env.cleanup;

    const project = await insertProject(db, { name: 'Cosine Bucket Test' });
    projectId = project.projectId;

    // Insert feedback with varied confidence values
    const entries = [
      { id: 'cb_01', action: 'accept' as const, confidence: 0.95 },
      { id: 'cb_02', action: 'accept' as const, confidence: 0.92 },
      { id: 'cb_03', action: 'edit' as const, confidence: 0.85 },
      { id: 'cb_04', action: 'reject' as const, confidence: 0.62 },
      { id: 'cb_05', action: 'accept' as const, confidence: 0.55 },
    ];

    for (const e of entries) {
      await insertExtractionFeedback(db, {
        ...e,
        project_id: projectId,
        draft_id: 'draft_bucket',
        sp_id: `sp_${e.id}`,
        inference_type: 'direct',
        zone: 'ready',
      });
    }
  });

  afterAll(async () => {
    await cleanup();
  });

  it('returns 10 confidence buckets', async () => {
    const buckets = await getFeedbackByCosineBucket(db, projectId);
    expect(buckets).toHaveLength(10);

    // First bucket: 0.0-0.1
    expect(buckets[0].bucket).toBe('0.0-0.1');
    // Last bucket: 0.9-1.0
    expect(buckets[9].bucket).toBe('0.9-1.0');
  });

  it('groups feedback into correct buckets', async () => {
    const buckets = await getFeedbackByCosineBucket(db, projectId);

    // 0.9-1.0 bucket: conf 0.95, 0.92
    const bucket9 = buckets.find((b) => b.bucket === '0.9-1.0');
    expect(bucket9?.total).toBe(2);
    expect(bucket9?.accepted).toBe(2);

    // 0.8-0.9 bucket: conf 0.85
    const bucket8 = buckets.find((b) => b.bucket === '0.8-0.9');
    expect(bucket8?.total).toBe(1);
    expect(bucket8?.edited).toBe(1);

    // 0.6-0.7 bucket: conf 0.62
    const bucket6 = buckets.find((b) => b.bucket === '0.6-0.7');
    expect(bucket6?.total).toBe(1);
    expect(bucket6?.rejected).toBe(1);

    // 0.5-0.6 bucket: conf 0.55
    const bucket5 = buckets.find((b) => b.bucket === '0.5-0.6');
    expect(bucket5?.total).toBe(1);
    expect(bucket5?.accepted).toBe(1);
  });

  it('calculates accept_rate per bucket', async () => {
    const buckets = await getFeedbackByCosineBucket(db, projectId);

    const bucket9 = buckets.find((b) => b.bucket === '0.9-1.0');
    expect(bucket9?.accept_rate).toBe(1.0); // 2/2

    const bucket6 = buckets.find((b) => b.bucket === '0.6-0.7');
    expect(bucket6?.accept_rate).toBe(0); // 0/1
  });

  it('returns zero counts for empty project', async () => {
    const buckets = await getFeedbackByCosineBucket(db, 'proj_empty');
    expect(buckets).toHaveLength(10);
    for (const b of buckets) {
      expect(b.total).toBe(0);
      expect(b.accept_rate).toBe(0);
    }
  });
});
