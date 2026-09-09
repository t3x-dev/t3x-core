/**
 * Autopilot Route Tests
 *
 * Tests for:
 * - GET  /v1/projects/:projectId/autopilot/config
 * - PUT  /v1/projects/:projectId/autopilot/config
 * - GET  /v1/projects/:projectId/autopilot/adaptive
 */

import type { AnyDB } from '@t3x-dev/storage';
import { insertProject } from '@t3x-dev/storage';
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
        min_nodes: 1,
        auto_create_leaf: false,
        target_branch: 'main',
      });
    });

    it('returns stored config after PUT', async () => {
      // First update the config
      await app.request(`/v1/projects/${testProjectId}/autopilot/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });

      // Now GET should return the updated config
      const res = await app.request(`/v1/projects/${testProjectId}/autopilot/config`, {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const json: ApiResponse = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.config.enabled).toBe(true);
      // Defaults preserved
      expect(json.data.config.min_nodes).toBe(1);
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
      expect(json.data.config.min_nodes).toBeGreaterThanOrEqual(1);
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

  it('does not mount the retired workbench Draft auto-commit route', async () => {
    const response = await app.request('/v1/drafts/draft_retired/auto-commit', { method: 'POST' });
    expect(response.status).toBe(404);
  });
});
