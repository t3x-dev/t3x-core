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

vi.mock('../lib/webhook-dispatcher', () => ({
  webhookDispatcher: { dispatch: vi.fn() },
}));

const { mockGetProviderRegistry } = vi.hoisted(() => ({
  mockGetProviderRegistry: vi.fn(),
}));

vi.mock('../lib/provider-registry', () => ({
  getProviderRegistry: mockGetProviderRegistry,
}));

const EXTRACTION_YAML_FULL = `project:
  deadline: next Friday
  hires: 2 engineers
  budget: $50k
---
{
  "slot_quotes": {
    "deadline": "deadline is next Friday",
    "hires": "hire two engineers",
    "budget": "Budget is $50k"
  },
  "source_map": {
    "project": "[T1:abc12345]"
  }
}`;

const PIPELINE_RESPONSES = {
  dedup: '{"decision": "keep_separate"}',
  topicName: 'project_plan',
  topicEvolve: '{"verdict": "keep", "name": "project_plan"}',
  slotPolish: '{"slots": {}}',
  reviewer: '{"status": "approved", "issues": []}',
  coverageStep1: JSON.stringify({
    points: [{ type: 'fact', text: 'project plan', quote: 'project' }],
  }),
  coverageStep2: '{"coverage_score": 1.0, "missing_points": []}',
  contradiction: '{"user_constraints": [], "contradictions": []}',
};

function createMockProvider() {
  return {
    id: 'test-provider',
    generate: vi.fn().mockImplementation(async (prompt: string) => {
      const usage = { inputTokens: 100, outputTokens: 50 };
      if (
        prompt.includes('knowledge extraction engine') ||
        prompt.includes('Extraction Priority')
      ) {
        return { text: EXTRACTION_YAML_FULL, usage };
      }
      if (prompt.includes('two semantic frames describe the same concept')) {
        return { text: PIPELINE_RESPONSES.dedup, usage };
      }
      if (prompt.includes('name the main topic')) {
        return { text: PIPELINE_RESPONSES.topicName, usage };
      }
      if (prompt.includes('topic name still fits')) {
        return { text: PIPELINE_RESPONSES.topicEvolve, usage };
      }
      if (prompt.includes('clean up YAML key names')) {
        return { text: PIPELINE_RESPONSES.slotPolish, usage };
      }
      if (prompt.includes('review a structured meaning document')) {
        return { text: PIPELINE_RESPONSES.reviewer, usage };
      }
      if (prompt.includes('extract ALL important points') || prompt.includes('You extract ALL')) {
        return { text: PIPELINE_RESPONSES.coverageStep1, usage };
      }
      if (
        prompt.includes('compare a list of user-stated points') ||
        prompt.includes('You compare')
      ) {
        return { text: PIPELINE_RESPONSES.coverageStep2, usage };
      }
      if (prompt.includes('detect contradictions')) {
        return { text: PIPELINE_RESPONSES.contradiction, usage };
      }
      return { text: '{}', usage };
    }),
    resolveConflict: vi.fn().mockImplementation(async () => ({
      text: '',
      usage: { inputTokens: 0, outputTokens: 0 },
    })),
  };
}

function setupMockRegistry() {
  mockGetProviderRegistry.mockResolvedValue({
    tryWithFallback: vi
      .fn()
      .mockImplementation(async (_role: string, fn: (provider: unknown) => Promise<unknown>) => {
        const provider = createMockProvider();
        return fn(provider);
      }),
  });
}

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
    setupMockRegistry();
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
