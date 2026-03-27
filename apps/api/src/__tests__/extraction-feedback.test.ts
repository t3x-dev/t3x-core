/**
 * Extraction Feedback Recording Tests
 *
 * Verifies that POST /v1/drafts/:id/review-action records extraction feedback
 * via insertExtractionFeedback after applying the review action.
 *
 * The feedback call is fire-and-forget: failures must NOT affect the review
 * action response.
 */

// SemanticPoint removed from core; define locally
interface SemanticPoint { id: string; text: string; confidence?: number; zone: string; status: string; staged: boolean; evidence?: any[]; extraction_mode?: string; inference_type?: string; position?: number; routing_reason?: string; inherited_from?: string; low_coverage?: boolean }
import type { AnyDB } from '@t3x-dev/storage';
import { insertDraft, insertProject, updateDraft } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Hoist the mock so it can be referenced in vi.mock factory
const { mockInsertExtractionFeedback, mockGenerateLeafOutput, mockIsGenerationConfigured } =
  vi.hoisted(() => ({
    mockInsertExtractionFeedback: vi.fn().mockResolvedValue(undefined),
    mockGenerateLeafOutput: vi.fn(),
    mockIsGenerationConfigured: vi.fn(),
  }));

// Mock @t3x-dev/core generation functions (required by drafts.openapi.ts imports)
vi.mock('@t3x-dev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/core')>();
  return {
    ...actual,
    generateLeafOutput: mockGenerateLeafOutput,
    isGenerationConfigured: mockIsGenerationConfigured,
  };
});

// Mock insertExtractionFeedback while keeping all other storage functions real
vi.mock('@t3x-dev/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/storage')>();
  return {
    ...actual,
    insertExtractionFeedback: mockInsertExtractionFeedback,
  };
});

import { draftsRoutes } from '../routes/drafts.openapi';

describe('Extraction feedback recording in review-action', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', draftsRoutes);

  const makeSP = (overrides: Partial<SemanticPoint> = {}): SemanticPoint => ({
    id: `sp_test_${Math.random().toString(36).slice(2, 8)}`,
    text: 'Test semantic point',
    extraction_mode: 'llm_extracted',
    status: 'auto_landed',
    zone: 'review',
    evidence: [],
    confidence: 0.9,
    position: 0,
    staged: false,
    ...overrides,
  });

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Extraction Feedback Test' })
    );
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup?.();
  });

  beforeEach(() => {
    mockInsertExtractionFeedback.mockClear();
    mockInsertExtractionFeedback.mockResolvedValue(undefined);
  });

  async function createDraftWithSPs(sps: SemanticPoint[]) {
    const draft = await insertDraft(mockDB, {
      project_id: testProjectId,
      title: 'Feedback test draft',
    });
    await updateDraft(
      mockDB,
      draft.id,
      {
        semantic_points: sps,
        extraction_mode: 'llm',
      },
      draft.revision
    );
    return draft.id;
  }

  it('records feedback with action=accept after accept review-action', async () => {
    const sp = makeSP({
      id: 'sp_fb_accept',
      zone: 'review',
      status: 'auto_landed',
      inference_type: 'direct',
      confidence: 0.92,
    });
    const draftId = await createDraftWithSPs([sp]);

    const res = await app.request(`/v1/drafts/${draftId}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sp_id: 'sp_fb_accept', action: 'accept' }),
    });

    expect(res.status).toBe(200);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);

    // Verify insertExtractionFeedback was called
    expect(mockInsertExtractionFeedback).toHaveBeenCalledTimes(1);
    const call = mockInsertExtractionFeedback.mock.calls[0];
    // First arg is the DB instance, second is the feedback input
    const feedbackInput = call[1];
    expect(feedbackInput.project_id).toBe(testProjectId);
    expect(feedbackInput.draft_id).toBe(draftId);
    expect(feedbackInput.sp_id).toBe('sp_fb_accept');
    expect(feedbackInput.action).toBe('accept');
    expect(feedbackInput.inference_type).toBe('direct');
    expect(feedbackInput.confidence).toBe(0.92);
    expect(feedbackInput.zone).toBe('review');
    expect(feedbackInput.id).toMatch(/^ef_/);
  });

  it('records feedback with action=reject after dismiss review-action', async () => {
    const sp = makeSP({
      id: 'sp_fb_dismiss',
      zone: 'review',
      inference_type: 'paraphrase',
      confidence: 0.75,
    });
    const draftId = await createDraftWithSPs([sp]);

    const res = await app.request(`/v1/drafts/${draftId}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sp_id: 'sp_fb_dismiss', action: 'dismiss' }),
    });

    expect(res.status).toBe(200);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);

    expect(mockInsertExtractionFeedback).toHaveBeenCalledTimes(1);
    const feedbackInput = mockInsertExtractionFeedback.mock.calls[0][1];
    expect(feedbackInput.sp_id).toBe('sp_fb_dismiss');
    // dismiss is mapped to 'reject' by the review-action route handler
    expect(feedbackInput.action).toBe('reject');
    expect(feedbackInput.inference_type).toBe('paraphrase');
    expect(feedbackInput.confidence).toBe(0.75);
    expect(feedbackInput.zone).toBe('review');
  });

  it('records feedback with edited_text after edit review-action', async () => {
    const sp = makeSP({
      id: 'sp_fb_edit',
      zone: 'review',
      text: 'Original extraction text',
      inference_type: 'cross_turn',
      confidence: 0.65,
    });
    const draftId = await createDraftWithSPs([sp]);

    const res = await app.request(`/v1/drafts/${draftId}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sp_id: 'sp_fb_edit',
        action: 'edit',
        edited_text: 'Corrected extraction text',
      }),
    });

    expect(res.status).toBe(200);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);

    expect(mockInsertExtractionFeedback).toHaveBeenCalledTimes(1);
    const feedbackInput = mockInsertExtractionFeedback.mock.calls[0][1];
    expect(feedbackInput.sp_id).toBe('sp_fb_edit');
    expect(feedbackInput.action).toBe('edit');
    expect(feedbackInput.edited_text).toBe('Corrected extraction text');
    expect(feedbackInput.inference_type).toBe('cross_turn');
    expect(feedbackInput.confidence).toBe(0.65);
    expect(feedbackInput.zone).toBe('review');
  });

  it('records feedback with action=undo after undo review-action', async () => {
    const sp = makeSP({
      id: 'sp_fb_undo',
      zone: 'ready',
      status: 'auto_landed',
      staged: true,
      inference_type: 'implicit',
      confidence: 0.55,
    });
    const draftId = await createDraftWithSPs([sp]);

    const res = await app.request(`/v1/drafts/${draftId}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sp_id: 'sp_fb_undo', action: 'undo' }),
    });

    expect(res.status).toBe(200);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);

    expect(mockInsertExtractionFeedback).toHaveBeenCalledTimes(1);
    const feedbackInput = mockInsertExtractionFeedback.mock.calls[0][1];
    expect(feedbackInput.sp_id).toBe('sp_fb_undo');
    expect(feedbackInput.action).toBe('undo');
    expect(feedbackInput.inference_type).toBe('implicit');
    expect(feedbackInput.confidence).toBe(0.55);
    expect(feedbackInput.zone).toBe('ready');
  });

  it('review-action still succeeds when insertExtractionFeedback throws', async () => {
    // Make the feedback insertion fail
    mockInsertExtractionFeedback.mockRejectedValueOnce(new Error('DB connection failed'));

    const sp = makeSP({
      id: 'sp_fb_error',
      zone: 'review',
      inference_type: 'direct',
      confidence: 0.88,
    });
    const draftId = await createDraftWithSPs([sp]);

    const res = await app.request(`/v1/drafts/${draftId}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sp_id: 'sp_fb_error', action: 'accept' }),
    });

    // The review-action must succeed despite feedback failure
    expect(res.status).toBe(200);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);

    // The SP should still have been updated correctly
    const updated = data.data.semantic_points.find((s: SemanticPoint) => s.id === 'sp_fb_error');
    expect(updated.zone).toBe('ready');
    expect(updated.status).toBe('reviewed');
    expect(updated.staged).toBe(true);

    // insertExtractionFeedback was called but threw
    expect(mockInsertExtractionFeedback).toHaveBeenCalledTimes(1);
  });

  it('records feedback with original zone before the action mutates it', async () => {
    // The SP starts in zone='review'. After accept, it moves to 'ready'.
    // The feedback should record the ORIGINAL zone ('review') since the
    // production code reads sp.zone before the switch mutates sps[idx].
    const sp = makeSP({
      id: 'sp_fb_zone_check',
      zone: 'review',
      inference_type: 'direct',
      confidence: 0.9,
    });
    const draftId = await createDraftWithSPs([sp]);

    const res = await app.request(`/v1/drafts/${draftId}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sp_id: 'sp_fb_zone_check', action: 'accept' }),
    });

    expect(res.status).toBe(200);

    const feedbackInput = mockInsertExtractionFeedback.mock.calls[0][1];
    // The zone in feedback should be the original 'review', not the mutated 'ready'
    expect(feedbackInput.zone).toBe('review');
  });

  it('records feedback with undefined edited_text for non-edit actions', async () => {
    const sp = makeSP({
      id: 'sp_fb_no_edit',
      zone: 'review',
      inference_type: 'direct',
      confidence: 0.9,
    });
    const draftId = await createDraftWithSPs([sp]);

    const res = await app.request(`/v1/drafts/${draftId}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sp_id: 'sp_fb_no_edit', action: 'accept' }),
    });

    expect(res.status).toBe(200);

    const feedbackInput = mockInsertExtractionFeedback.mock.calls[0][1];
    expect(feedbackInput.edited_text).toBeUndefined();
  });

  it('does not call insertExtractionFeedback for non-existent SP (404)', async () => {
    const sp = makeSP({ id: 'sp_fb_exists' });
    const draftId = await createDraftWithSPs([sp]);

    const res = await app.request(`/v1/drafts/${draftId}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sp_id: 'sp_nonexistent', action: 'accept' }),
    });

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('NOT_FOUND');

    // Feedback should NOT be recorded for failed requests
    expect(mockInsertExtractionFeedback).not.toHaveBeenCalled();
  });
});
