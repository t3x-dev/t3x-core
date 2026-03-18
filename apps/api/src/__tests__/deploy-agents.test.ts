/**
 * Deploy Agents Route Tests
 */

import type { AnyDB } from '@t3x-dev/storage';
import {
  deleteDeployAgent,
  findDeployAgents,
  insertDeployAgent,
  insertProject,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

type ApiResponse = Record<string, unknown>;

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { deployAgentRoutes } from '../routes/deploy-agents';

describe('Deploy Agents Routes', () => {
  let cleanup: () => Promise<void>;
  let projectId: string;
  const app = new Hono();
  app.route('/', deployAgentRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    // Create a project for deploy agents
    const proj = await insertProject(mockDB, testData.project({ name: 'Agent Project' }));
    projectId = proj.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    const existing = await findDeployAgents(mockDB, {});
    for (const a of existing) {
      await deleteDeployAgent(mockDB, a.deployAgentId);
    }
  });

  describe('POST /v1/deploy-agents', () => {
    it('creates a deploy agent', async () => {
      const res = await app.request('/v1/deploy-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'agent-1',
          name: 'Test Agent',
          endpoint: 'http://localhost:9000',
          project_id: projectId,
        }),
      });
      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect((data.data as Record<string, unknown>).name).toBe('Test Agent');
    });

    it('returns 400 when id missing', async () => {
      const res = await app.request('/v1/deploy-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x', endpoint: 'http://x' }),
      });
      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns 400 when name missing', async () => {
      const res = await app.request('/v1/deploy-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'x', endpoint: 'http://x' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when endpoint missing', async () => {
      const res = await app.request('/v1/deploy-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'x', name: 'x' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await app.request('/v1/deploy-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });

    it('validates project_id exists', async () => {
      const res = await app.request('/v1/deploy-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'agent-x',
          name: 'x',
          endpoint: 'http://x',
          project_id: 'proj_nonexistent',
        }),
      });
      expect(res.status).toBe(404);
      const data: ApiResponse = await res.json();
      expect((data.error as Record<string, unknown>).code).toBe('NOT_FOUND');
    });
  });

  describe('GET /v1/deploy-agents', () => {
    it('returns empty list', async () => {
      const res = await app.request('/v1/deploy-agents');
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect((data.data as Record<string, unknown>).deploy_agents).toEqual([]);
    });

    it('returns created agents', async () => {
      await insertDeployAgent(mockDB, {
        id: 'agent-list',
        name: 'List Agent',
        endpoint: 'http://localhost:9000',
        projectId,
      });
      const res = await app.request('/v1/deploy-agents');
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      const agents = (data.data as Record<string, unknown>).deploy_agents as unknown[];
      expect(agents.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by project_id', async () => {
      await insertDeployAgent(mockDB, {
        id: 'agent-filter',
        name: 'Filter Agent',
        endpoint: 'http://x',
        projectId,
      });
      const res = await app.request(`/v1/deploy-agents?project_id=${projectId}`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      const agents = (data.data as Record<string, unknown>).deploy_agents as unknown[];
      expect(agents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /v1/deploy-agents/:id', () => {
    it('returns specific agent', async () => {
      const agent = await insertDeployAgent(mockDB, {
        id: 'agent-get',
        name: 'Get Agent',
        endpoint: 'http://x',
      });
      const res = await app.request(`/v1/deploy-agents/${agent.deployAgentId}`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect((data.data as Record<string, unknown>).name).toBe('Get Agent');
    });

    it('returns 404 for non-existent agent', async () => {
      const res = await app.request('/v1/deploy-agents/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /v1/deploy-agents/:id', () => {
    it('updates agent name', async () => {
      const agent = await insertDeployAgent(mockDB, {
        id: 'agent-update',
        name: 'Old Name',
        endpoint: 'http://x',
      });
      const res = await app.request(`/v1/deploy-agents/${agent.deployAgentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name' }),
      });
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect((data.data as Record<string, unknown>).name).toBe('New Name');
    });

    it('returns 404 for non-existent agent', async () => {
      const res = await app.request('/v1/deploy-agents/nonexistent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /v1/deploy-agents/:id', () => {
    it('deletes agent', async () => {
      const agent = await insertDeployAgent(mockDB, {
        id: 'agent-del',
        name: 'Delete Me',
        endpoint: 'http://x',
      });
      const res = await app.request(`/v1/deploy-agents/${agent.deployAgentId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect((data.data as Record<string, unknown>).deleted).toBe(true);
    });

    it('returns 404 for non-existent agent', async () => {
      const res = await app.request('/v1/deploy-agents/nonexistent', {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });
  });
});
