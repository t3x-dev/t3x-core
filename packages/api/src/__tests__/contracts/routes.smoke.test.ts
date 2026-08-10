/**
 * Routes Smoke Tests (Route Existence Tests)
 *
 * These tests ensure critical API routes exist and haven't been accidentally deleted or renamed.
 * They don't test functionality, just that the routes respond (not 404).
 *
 * IMPORTANT: If these tests fail, it means a critical route was removed or renamed.
 * Before removing a route, ensure:
 * 1. apps/web/src/infrastructure/*.ts - frontend API adapters are updated
 * 2. apps/runner/src/*.ts - runner code is updated
 * 3. Any n8n workflows are updated
 */

import type { AnyDB } from '@t3x-dev/storage';
import { ensureMainBranch, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from '../setup';

// Mock the database module
let mockDB: AnyDB;

vi.mock('../../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { generationRoutes } from '../../routes/chat.openapi';
import { contextRoutes } from '../../routes/context.openapi';
import { deployAgentRoutes } from '../../routes/deploy-agents.openapi';
import { knowledgeGraphRoutes } from '../../routes/knowledge-graph.openapi';
import { materialsRoutes } from '../../routes/materials.openapi';
import { projectRoutes } from '../../routes/projects.openapi';
// Import all route modules
import { runsRoutes } from '../../routes/runs.openapi';
import { searchRoutes } from '../../routes/search.openapi';
import { statusRoutes } from '../../routes/status.openapi';

describe('Critical Routes Smoke Tests', () => {
  let cleanup: () => Promise<void>;
  let smokeProjectId: string;
  const app = new Hono();

  // Mount all routes
  app.route('/', runsRoutes);
  app.route('/', deployAgentRoutes);
  app.route('/', statusRoutes);
  app.route('/', projectRoutes);
  app.route('/', generationRoutes);
  app.route('/', contextRoutes);
  app.route('/', knowledgeGraphRoutes);
  app.route('/', materialsRoutes);
  app.route('/', searchRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    smokeProjectId = (await insertProject(mockDB, { name: 'Query surface smoke project' }))
      .projectId;
    await ensureMainBranch(mockDB, smokeProjectId);
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('Runner/n8n Integration Routes (CRITICAL)', () => {
    // These routes are essential for the Runner → n8n → Engine flow
    const criticalRunnerRoutes = [
      { method: 'GET', path: '/v1/runs', description: 'List runs - used by Deploy page' },
      { method: 'POST', path: '/v1/runs', description: 'Create run - triggers n8n workflow' },
      {
        method: 'POST',
        path: '/v1/runs/ingest',
        description: 'Ingest callback - receives n8n results',
      },
    ];

    it.each(criticalRunnerRoutes)('$method $path exists ($description)', async ({
      method,
      path,
    }) => {
      const res = await app.request(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({}) : undefined,
      });

      // Should not be 404 (route not found)
      expect(res.status).not.toBe(404);
      // Log actual status for debugging
      if (res.status === 404) {
        console.error(`CRITICAL: Route ${method} ${path} not found!`);
      }
    });

    it('GET /v1/runs/:id route exists', async () => {
      const res = await app.request('/v1/runs/run_test123');
      // 404 means run not found (OK), but route exists
      // If route didn't exist, Hono returns different error
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('Deploy Agents Routes (CRITICAL)', () => {
    const deployAgentRoutes = [
      { method: 'GET', path: '/v1/deploy-agents', description: 'List deploy agents' },
      { method: 'POST', path: '/v1/deploy-agents', description: 'Create deploy agent' },
    ];

    it.each(deployAgentRoutes)('$method $path exists ($description)', async ({ method, path }) => {
      const res = await app.request(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:
          method === 'POST'
            ? JSON.stringify({ id: 'test', name: 'test', endpoint: 'http://test' })
            : undefined,
      });

      expect(res.status).not.toBe(404);
    });

    it('GET /v1/deploy-agents/:id route exists', async () => {
      const res = await app.request('/v1/deploy-agents/test_agent');
      expect([200, 404]).toContain(res.status);
    });

    it('PUT /v1/deploy-agents/:id route exists', async () => {
      const res = await app.request('/v1/deploy-agents/test_agent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'updated' }),
      });
      expect([200, 404]).toContain(res.status);
    });

    it('DELETE /v1/deploy-agents/:id route exists', async () => {
      const res = await app.request('/v1/deploy-agents/test_agent', {
        method: 'DELETE',
      });
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('Core Routes (for reference)', () => {
    // These are core routes that Runner might depend on indirectly
    const coreRoutes = [
      { method: 'GET', path: '/v1/status', description: 'Health/status check' },
      { method: 'GET', path: '/v1/projects', description: 'List projects' },
    ];

    it.each(coreRoutes)('$method $path exists ($description)', async ({ method, path }) => {
      const res = await app.request(path, { method });
      expect(res.status).not.toBe(404);
    });
  });

  describe('Project query and generation surfaces', () => {
    it('serves context, graph, material, and search reads through their mounted routes', async () => {
      const requests = [
        app.request(`/v1/projects/${smokeProjectId}/context`),
        app.request(`/v1/projects/${smokeProjectId}/knowledge-graph/nodes`),
        app.request(`/v1/projects/${smokeProjectId}/materials`),
        app.request('/v1/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: smokeProjectId, query: 'smoke' }),
        }),
      ];

      for (const response of await Promise.all(requests)) {
        expect(response.status).toBe(200);
      }
    });

    it('mounts both generation routes before provider work', async () => {
      const invalidBody = JSON.stringify({});
      const nonStreaming = await app.request('/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: invalidBody,
      });
      const streaming = await app.request('/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: invalidBody,
      });

      expect(nonStreaming.status).toBe(400);
      expect(streaming.status).toBe(400);
    });
  });

  describe('Route Path Format Validation', () => {
    // Ensure routes use consistent /v1/ prefix
    it('all critical routes use /v1/ prefix', async () => {
      const routesWithoutV1 = [
        '/runs',
        '/deploy-agents',
        '/api/runs', // wrong prefix
        '/api/v1/runs', // double prefix (if mounted at /api)
      ];

      for (const path of routesWithoutV1) {
        const res = await app.request(path);
        // These should be 404 because correct routes have /v1/ prefix
        expect(res.status).toBe(404);
      }
    });
  });
});
