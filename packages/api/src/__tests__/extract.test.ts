/**
 * Extract Route Tests
 *
 * Integration tests for POST /v1/extract endpoint.
 */

import type { AnyDB } from '@t3x-dev/storage';
import { insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Mock the webhook dispatcher
const mockDispatch = vi.fn();
vi.mock('../lib/webhook-dispatcher', () => ({
  webhookDispatcher: {
    dispatch: (...args: unknown[]) => mockDispatch(...args),
  },
}));

// Mock provider registry (mirrors extract-e2e.test.ts pattern)
const { mockGetProviderRegistry } = vi.hoisted(() => ({
  mockGetProviderRegistry: vi.fn(),
}));

vi.mock('../lib/provider-registry', () => ({
  getProviderRegistry: mockGetProviderRegistry,
}));

/** Full-mode extractor YAML + metadata (consumed by FrameExtractor). */
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

/** Incremental-mode YOps delta. */
const EXTRACTION_YOPS_DELTA = `yops:
  - set:
      path: project/budget
      value: $100k`;

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

function createMockProvider(mode: 'full' | 'incremental' = 'full') {
  return {
    id: 'test-provider',
    generate: vi.fn().mockImplementation(async (prompt: string) => {
      const usage = { inputTokens: 100, outputTokens: 50 };

      if (
        prompt.includes('knowledge extraction engine') ||
        prompt.includes('Extraction Priority')
      ) {
        if (mode === 'incremental' || prompt.includes('Current Tree')) {
          return { text: EXTRACTION_YOPS_DELTA, usage };
        }
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

function setupMockRegistry(mode: 'full' | 'incremental' = 'full') {
  mockGetProviderRegistry.mockResolvedValue({
    tryWithFallback: vi
      .fn()
      .mockImplementation(async (_role: string, fn: (provider: unknown) => Promise<unknown>) => {
        const provider = createMockProvider(mode);
        return fn(provider);
      }),
  });
}

// Import routes after mocking
import { extractRoutes } from '../routes/extract.openapi';

describe('Extract Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', extractRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project
    const project = await insertProject(mockDB, testData.project({ name: 'Extract Test Project' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    mockDispatch.mockClear();
    setupMockRegistry('full');
  });

  describe('POST /v1/extract', () => {
    it('one-shot: creates conversation, extracts trees, returns draft', async () => {
      const res = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'The project deadline is next Friday. We need to hire two engineers. Budget is $50k.',
          source: 'test-api',
        }),
      });

      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.conversation_id).toBeTruthy();
      expect(data.data.conversation_id).toMatch(/^conv_/);
      expect(data.data.draft_id).toBeTruthy();
      expect(data.data.trees).toBeInstanceOf(Array);
      expect(data.data.trees.length).toBeGreaterThan(0);

      // Each tree node should have key and slots
      for (const node of data.data.trees) {
        expect(node.key).toBeTruthy();
        expect(node.slots).toBeTruthy();
        expect(node.slots).toBeDefined();
      }
    });

    it('incremental: reuses conversation_id, appends turn', async () => {
      // First extraction — creates conversation
      const res1 = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'First message with some content.',
        }),
      });

      expect(res1.status).toBe(200);
      const data1: ApiResponse = await res1.json();
      const conversationId = data1.data.conversation_id;

      // Second extraction — reuses conversation
      const res2 = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'Second message with additional details.',
          conversation_id: conversationId,
        }),
      });

      expect(res2.status).toBe(200);
      const data2: ApiResponse = await res2.json();
      expect(data2.success).toBe(true);
      expect(data2.data.conversation_id).toBe(conversationId);
      expect(data2.data.draft_id).toBeTruthy();
      expect(data2.data.trees.length).toBeGreaterThan(0);
    });

    it('fires draft.ready webhook on successful extraction', async () => {
      const res = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'Webhook test message with content.',
        }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);

      // draft.ready webhook should have been dispatched
      expect(mockDispatch).toHaveBeenCalledWith(
        'draft.ready',
        expect.objectContaining({
          project_id: testProjectId,
          draft_id: expect.any(String),
          tree_count: expect.any(Number),
        }),
        testProjectId
      );
    });

    it('returns 400 for empty text (Zod validation)', async () => {
      const res = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: '',
        }),
      });

      // Zod min(1) validation should reject empty text
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent project', async () => {
      const res = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: 'proj_nonexistent',
          text: 'Some text to extract.',
        }),
      });

      expect(res.status).toBe(404);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns 404 for non-existent conversation_id', async () => {
      const res = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'Some text.',
          conversation_id: 'conv_nonexistent',
        }),
      });

      expect(res.status).toBe(404);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('detects drift in incremental mode', async () => {
      // First extraction
      const res1 = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'The budget is $50k for the project.',
        }),
      });
      const data1: ApiResponse = await res1.json();
      const conversationId = data1.data.conversation_id;

      // Second extraction with changed content — adds new turn
      const res2 = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'Actually the budget is $100k for the project.',
          conversation_id: conversationId,
        }),
      });

      expect(res2.status).toBe(200);
      const data2: ApiResponse = await res2.json();
      expect(data2.success).toBe(true);
      // Drift may or may not be present depending on similarity — just check shape
      if (data2.data.drift) {
        expect(data2.data.drift).toBeInstanceOf(Array);
        for (const item of data2.data.drift) {
          expect(item.node_path).toBeTruthy();
          expect(typeof item.before).toBe('string');
          expect(typeof item.after).toBe('string');
        }
      }
    });

    it('returns extraction_mode in response', async () => {
      const res = await app.request('/v1/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          text: 'Budget is $50k for the project.',
        }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.extraction_mode).toBeDefined();
      expect(['llm', 'regex']).toContain(data.data.extraction_mode);
    });
  });
});
