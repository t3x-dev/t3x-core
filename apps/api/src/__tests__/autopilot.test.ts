/**
 * Autopilot Route Tests
 *
 * Tests for:
 * - GET  /v1/projects/:projectId/autopilot/config
 * - PUT  /v1/projects/:projectId/autopilot/config
 * - GET  /v1/projects/:projectId/autopilot/adaptive
 * - POST /v1/drafts/:draftId/auto-commit
 */

import type { PGLiteDB } from '@t3x/storage/pglite';
import {
  insertDraftV3,
  insertProject,
  updateAutopilotConfig,
  updateDraftV3,
} from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

let mockDB: PGLiteDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('../middleware/logger', () => ({
  pinoLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../lib/webhook-dispatcher', () => ({
  webhookDispatcher: { dispatch: vi.fn() },
}));

import { autopilotRoutes } from '../routes/autopilot.openapi';

describe('Autopilot Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', autopilotRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Autopilot Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // ── GET /v1/projects/:projectId/autopilot/config ──────────

  describe('GET /config', () => {
    it('returns default config when none set', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/autopilot/config`, {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.config).toEqual({
        enabled: false,
        min_confidence: 0.85,
        min_sentences: 1,
        auto_create_leaf: false,
        target_branch: 'main',
      });
    });

    it('returns stored config after PUT', async () => {
      // First update the config
      await app.request(`/v1/projects/${testProjectId}/autopilot/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true, min_confidence: 0.9 }),
      });

      // Now GET should return the updated config
      const res = await app.request(`/v1/projects/${testProjectId}/autopilot/config`, {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.config.enabled).toBe(true);
      expect(json.data.config.min_confidence).toBe(0.9);
      // Defaults preserved
      expect(json.data.config.min_sentences).toBe(1);
      expect(json.data.config.target_branch).toBe('main');
    });
  });

  // ── PUT /v1/projects/:projectId/autopilot/config ──────────

  describe('PUT /config', () => {
    it('updates config with partial values', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/autopilot/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.config.enabled).toBe(true);
      // Other fields preserved from defaults or previous config
      expect(json.data.config.min_confidence).toBeGreaterThan(0);
      expect(json.data.config.min_sentences).toBeGreaterThanOrEqual(1);
      expect(json.data.config.target_branch).toBe('main');
    });

    it('updates target_branch', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/autopilot/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_branch: 'develop' }),
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.data.config.target_branch).toBe('develop');
    });
  });

  // ── GET /v1/projects/:projectId/autopilot/adaptive ────────

  describe('GET /adaptive', () => {
    it('returns null adaptive when no feedback data', async () => {
      const res = await app.request(`/v1/projects/${testProjectId}/autopilot/adaptive`, {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.adaptive).toBeNull();
      expect(json.data.message).toBe('Insufficient feedback data');
    });
  });

  // ── POST /v1/drafts/:draftId/auto-commit ──────────────────

  describe('POST /auto-commit', () => {
    it('returns 404 for non-existent draft', async () => {
      const res = await app.request('/v1/drafts/draft_nonexistent/auto-commit', {
        method: 'POST',
      });

      expect(res.status).toBe(404);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('DRAFT_NOT_FOUND');
    });

    it('returns auto_committed=false when autopilot disabled', async () => {
      // Reset autopilot config to disabled
      await updateAutopilotConfig(mockDB, testProjectId, { enabled: false });

      // Create a draft with LLM extraction mode
      const draft = await insertDraftV3(mockDB, {
        project_id: testProjectId,
        title: 'Test Draft for AutoCommit',
      });

      // Set extraction_mode to 'llm' and add semantic points
      await updateDraftV3(
        mockDB,
        draft.id,
        {
          extraction_mode: 'llm',
          semantic_points: [
            {
              id: 'sp_test1',
              text: 'Test sentence one',
              confidence: 0.9,
              zone: 'ready',
              status: 'auto_landed',
              staged: true,
              extraction_mode: 'llm_extracted',
              evidence: [],
              position: 0,
            },
          ],
        },
        1
      );

      const res = await app.request(`/v1/drafts/${draft.id}/auto-commit`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.auto_committed).toBe(false);
      expect(json.data.reason).toBe('autopilot_disabled');
    });

    it('returns 400 for non-llm extraction mode', async () => {
      // Create a draft with deterministic extraction mode
      const draft = await insertDraftV3(mockDB, {
        project_id: testProjectId,
        title: 'Deterministic Draft',
      });

      // Set extraction_mode to 'deterministic'
      await updateDraftV3(
        mockDB,
        draft.id,
        {
          extraction_mode: 'deterministic',
        },
        1
      );

      const res = await app.request(`/v1/drafts/${draft.id}/auto-commit`, {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('INVALID_REQUEST');
    });

    it('auto-commits when autopilot enabled and candidates qualify', async () => {
      // Enable autopilot
      await updateAutopilotConfig(mockDB, testProjectId, {
        enabled: true,
        min_confidence: 0.8,
        min_sentences: 1,
        target_branch: 'main',
      });

      // Create a draft with LLM mode and qualifying semantic points
      const draft = await insertDraftV3(mockDB, {
        project_id: testProjectId,
        title: 'Auto-Commit Draft',
      });

      await updateDraftV3(
        mockDB,
        draft.id,
        {
          extraction_mode: 'llm',
          semantic_points: [
            {
              id: 'sp_auto1',
              text: 'High confidence sentence',
              confidence: 0.95,
              zone: 'ready',
              status: 'auto_landed',
              staged: true,
              extraction_mode: 'llm_extracted',
              evidence: [],
              position: 0,
            },
            {
              id: 'sp_auto2',
              text: 'Low confidence sentence',
              confidence: 0.5,
              zone: 'ready',
              status: 'auto_landed',
              staged: true,
              extraction_mode: 'llm_extracted',
              evidence: [],
              position: 1,
            },
          ],
        },
        1
      );

      const res = await app.request(`/v1/drafts/${draft.id}/auto-commit`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.auto_committed).toBe(true);
      expect(json.data.commit).toBeDefined();
      expect(json.data.commit.hash).toBeDefined();
      expect(json.data.sentences_committed).toBe(1); // Only sp_auto1 qualifies (0.95 >= 0.8)
      expect(json.data.sentences_skipped).toBeGreaterThanOrEqual(1); // sp_auto2 skipped
    });
  });
});
