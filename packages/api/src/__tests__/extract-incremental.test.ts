/**
 * Extract Incremental Route Tests — POST /v1/extract/incremental
 *
 * Verifies the adapter-over-pipeline restoration (Bug-2 deep-walk fix).
 * Mirrors the provider mock pattern used by extract.test.ts.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { insertConversation, insertDraft, insertProject, insertTurn } from '@t3x-dev/storage';
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

vi.mock('../lib/provider-registry', () => ({
  getProviderRegistry: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../lib/webhook-dispatcher', () => ({
  webhookDispatcher: { dispatch: vi.fn() },
}));

const { mockRunApiExtractionV2 } = vi.hoisted(() => ({
  mockRunApiExtractionV2: vi.fn(),
}));

vi.mock('../lib/extraction-v2', () => ({
  runApiExtractionV2: mockRunApiExtractionV2,
}));

// Import after mocks
import { extractIncrementalRoutes } from '../routes/extract-incremental.openapi';

describe('POST /v1/extract/incremental', () => {
  let cleanup: () => Promise<void>;
  let projectId: string;
  let conversationId: string;
  let draftId: string;
  const app = new Hono();
  app.route('/', extractIncrementalRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Extract Incremental Test' })
    );
    projectId = project.projectId;

    const conversation = await insertConversation(mockDB, {
      projectId,
      title: 'wizard',
    });
    conversationId = conversation.conversationId;

    await insertTurn(mockDB, {
      projectId,
      conversationId,
      role: 'user',
      content:
        'The project deadline is next Friday. We need to hire two engineers. Budget is $50k.',
    });

    const draft = await insertDraft(mockDB, {
      project_id: projectId,
      title: 'Pending commit',
    });
    draftId = draft.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    mockRunApiExtractionV2.mockResolvedValue({
      ok: true,
      mode: 'bootstrap',
      snapshot: {
        trees: [{ key: 'project', slots: { deadline: 'next Friday', budget: '$50k' }, children: [] }],
        relations: [],
      },
      ops: [{ define: { path: 'project' }, source: { type: 'llm' } }],
      lastTurnHash: 'sha256:last',
    });
  });

  it('returns ready_points + empty review_points with expected envelope', async () => {
    const res = await app.request('/v1/extract/incremental', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        conversation_id: conversationId,
        draft_id: draftId,
      }),
    });

    expect(res.status).toBe(200);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.ready_points).toBeInstanceOf(Array);
    expect(data.data.review_points).toBeInstanceOf(Array);
    expect(data.data.review_points).toHaveLength(0);
    // Should have produced at least one ready point from the fake YAML
    expect(data.data.ready_points.length).toBeGreaterThan(0);
    for (const p of data.data.ready_points) {
      expect(p.id).toBeTruthy();
      expect(p.text).toBeTruthy();
      expect(p.zone).toBe('ready');
      expect(p.status).toBeDefined();
      expect(p.evidence).toBeInstanceOf(Array);
      expect(typeof p.position).toBe('number');
      expect(typeof p.staged).toBe('boolean');
    }

    expect(data.data.cursor).toBeDefined();
    expect(data.data.cursor.cursors).toBeDefined();
    expect(data.data.cursor.cursors[conversationId]).toBeDefined();

    expect(data.data.stats).toEqual(
      expect.objectContaining({
        total_turns: expect.any(Number),
        new_turns: expect.any(Number),
        proposals: expect.any(Number),
        auto_landed: expect.any(Number),
        needs_review: expect.any(Number),
        rejected: expect.any(Number),
      })
    );
    expect(data.data.stats.auto_landed).toBe(data.data.ready_points.length);
    expect(data.data.stats.needs_review).toBe(0);
  });

  it('returns 404 for unknown draft', async () => {
    const res = await app.request('/v1/extract/incremental', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        conversation_id: conversationId,
        draft_id: 'draft_nonexistent',
      }),
    });

    expect(res.status).toBe(404);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for unknown conversation', async () => {
    const res = await app.request('/v1/extract/incremental', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        conversation_id: 'conv_nonexistent',
        draft_id: draftId,
      }),
    });

    expect(res.status).toBe(404);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when project_id does not match draft', async () => {
    const res = await app.request('/v1/extract/incremental', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: 'proj_someone_else',
        conversation_id: conversationId,
        draft_id: draftId,
      }),
    });

    expect(res.status).toBe(400);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_REQUEST');
  });

  it('rejects missing fields (Zod 400)', async () => {
    const res = await app.request('/v1/extract/incremental', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId }),
    });
    expect(res.status).toBe(400);
  });
});
