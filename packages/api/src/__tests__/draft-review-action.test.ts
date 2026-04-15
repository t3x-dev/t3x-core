/**
 * Draft Review Action Tests
 *
 * Integration tests for POST /v1/drafts/:id/review-action endpoint.
 */

// SemanticPoint removed from core in tree-primary refactor; define locally
interface SemanticPoint {
  id: string;
  text: string;
  zone: string;
  status: string;
  staged: boolean;
  evidence?: Array<{
    conversation_id?: string;
    turn_hash?: string;
    start_char?: number;
    end_char?: number;
    role?: string;
  }>;
  extraction_mode?: string;
  inference_type?: string;
  routing_reason?: string;
  inherited_from?: string;
  low_coverage?: boolean;
  position?: number;
}

import type { AnyDB } from '@t3x-dev/storage';
import { insertDraft, insertProject, updateDraft } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock generation functions (needed by drafts.openapi.ts imports)
const { mockGenerateLeafOutput, mockIsGenerationConfigured } = vi.hoisted(() => ({
  mockGenerateLeafOutput: vi.fn(),
  mockIsGenerationConfigured: vi.fn(),
}));

vi.mock('@t3x-dev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/core')>();
  return {
    ...actual,
    generateLeafOutput: mockGenerateLeafOutput,
    isGenerationConfigured: mockIsGenerationConfigured,
  };
});

import { draftsRoutes } from '../routes/drafts.openapi';

describe('POST /v1/drafts/{id}/review-action', () => {
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
    position: 0,
    staged: false,
    ...overrides,
  });

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Review Action Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup?.();
  });

  async function createDraftWithSPs(sps: SemanticPoint[]) {
    const draft = await insertDraft(mockDB, {
      project_id: testProjectId,
      title: 'Review action draft',
    });
    // Update with semantic points and LLM mode
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

  it('accept moves SP from review to ready with status=reviewed', async () => {
    const sp = makeSP({ id: 'sp_accept_test', zone: 'review', status: 'auto_landed' });
    const draftId = await createDraftWithSPs([sp]);

    const res = await app.request(`/v1/drafts/${draftId}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sp_id: 'sp_accept_test', action: 'accept' }),
    });

    expect(res.status).toBe(200);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);

    const updated = data.data.semantic_points.find((s: SemanticPoint) => s.id === 'sp_accept_test');
    expect(updated.zone).toBe('ready');
    expect(updated.status).toBe('reviewed');
    expect(updated.staged).toBe(true);
  });

  it('dismiss removes SP from list', async () => {
    const sp = makeSP({ id: 'sp_dismiss_test', zone: 'review' });
    const draftId = await createDraftWithSPs([sp]);

    const res = await app.request(`/v1/drafts/${draftId}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sp_id: 'sp_dismiss_test', action: 'dismiss' }),
    });

    expect(res.status).toBe(200);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(
      data.data.semantic_points.find((s: SemanticPoint) => s.id === 'sp_dismiss_test')
    ).toBeUndefined();
  });

  it('undo marks SP as undone and unstaged', async () => {
    const sp = makeSP({
      id: 'sp_undo_test',
      zone: 'ready',
      status: 'auto_landed',
      staged: true,
    });
    const draftId = await createDraftWithSPs([sp]);

    const res = await app.request(`/v1/drafts/${draftId}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sp_id: 'sp_undo_test', action: 'undo' }),
    });

    expect(res.status).toBe(200);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);

    const updated = data.data.semantic_points.find((s: SemanticPoint) => s.id === 'sp_undo_test');
    expect(updated.status).toBe('undone');
    expect(updated.staged).toBe(false);
  });

  it('edit replaces text and moves to ready', async () => {
    const sp = makeSP({
      id: 'sp_edit_test',
      zone: 'review',
      text: 'Original text',
    });
    const draftId = await createDraftWithSPs([sp]);

    const res = await app.request(`/v1/drafts/${draftId}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sp_id: 'sp_edit_test',
        action: 'edit',
        edited_text: 'Corrected text',
      }),
    });

    expect(res.status).toBe(200);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);

    const updated = data.data.semantic_points.find((s: SemanticPoint) => s.id === 'sp_edit_test');
    expect(updated.text).toBe('Corrected text');
    expect(updated.zone).toBe('ready');
    expect(updated.status).toBe('reviewed');
    expect(updated.staged).toBe(true);
  });

  it('returns 404 for non-existent SP', async () => {
    const sp = makeSP({ id: 'sp_exists' });
    const draftId = await createDraftWithSPs([sp]);

    const res = await app.request(`/v1/drafts/${draftId}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sp_id: 'sp_nonexistent', action: 'accept' }),
    });

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('NOT_FOUND');
  });

  it('returns error for edit without edited_text', async () => {
    const sp = makeSP({ id: 'sp_edit_notext' });
    const draftId = await createDraftWithSPs([sp]);

    const res = await app.request(`/v1/drafts/${draftId}/review-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sp_id: 'sp_edit_notext', action: 'edit' }),
    });

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_REQUEST');
  });
});
