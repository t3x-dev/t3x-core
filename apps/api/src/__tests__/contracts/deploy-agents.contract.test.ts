/**
 * Deploy Agents API Contract Tests
 *
 * These tests ensure the API response schema doesn't change unexpectedly.
 * Deploy agents use snake_case (different from runs which use camelCase).
 *
 * IMPORTANT: If these tests fail after a refactor, you need to update:
 * 1. apps/web/src/lib/api.ts - DeployAgent interface
 * 2. apps/web/src/app/deploy/page.tsx - if field names change
 */

import {
  deleteDeployAgent,
  deleteProject,
  findDeployAgents,
  findProjects,
  insertDeployAgent,
  insertProject,
} from '@t3x-dev/storage';
import type { PGLiteDB } from '@t3x-dev/storage/pglite';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB } from '../setup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = any;

// Mock the database module before importing routes
let mockDB: PGLiteDB;

vi.mock('../../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

// Import routes after mocking
import { deployAgentRoutes } from '../../routes/deploy-agents';

describe('Deploy Agents API Contract', () => {
  let cleanup: () => Promise<void>;
  const app = new Hono();
  app.route('/', deployAgentRoutes);

  const testAgentId = 'agent_contract_test';
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Clean up test agents
    const existingAgents = await findDeployAgents(mockDB, {});
    for (const agent of existingAgents) {
      await deleteDeployAgent(mockDB, agent.deployAgentId);
    }
    // Clean up test projects
    const existingProjects = await findProjects(mockDB);
    for (const project of existingProjects) {
      await deleteProject(mockDB, project.projectId);
    }
    // Create a test project for foreign key reference
    const project = await insertProject(mockDB, {
      name: 'Contract Test Project',
    });
    testProjectId = project.projectId;
  });

  describe('GET /v1/deploy-agents - List response schema', () => {
    it('returns deploy_agents array with snake_case field names', async () => {
      // Insert test agent
      await insertDeployAgent(mockDB, {
        id: testAgentId,
        name: 'Test Agent',
        endpoint: 'http://localhost:5678/webhook/test',
        type: 'http',
      });

      const res = await app.request('/v1/deploy-agents');
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.deploy_agents).toBeInstanceOf(Array);
      expect(data.data.deploy_agents.length).toBeGreaterThan(0);

      const agent = data.data.deploy_agents[0];

      // CRITICAL: Deploy agents use snake_case (unlike runs which use camelCase)
      // If this fails, frontend DeployAgent interface needs updating
      expect(agent).toHaveProperty('deploy_agent_id');
      expect(agent).toHaveProperty('project_id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('endpoint');
      expect(agent).toHaveProperty('type');
      expect(agent).toHaveProperty('auth');
      expect(agent).toHaveProperty('status');
      expect(agent).toHaveProperty('last_run_id');
      expect(agent).toHaveProperty('last_run_at');
      expect(agent).toHaveProperty('created_at');
      expect(agent).toHaveProperty('updated_at');

      // Should NOT have camelCase versions
      expect(agent).not.toHaveProperty('deployAgentId');
      expect(agent).not.toHaveProperty('projectId');
      expect(agent).not.toHaveProperty('lastRunId');
      expect(agent).not.toHaveProperty('createdAt');
    });

    it('returns correct data types for deploy agent fields', async () => {
      // Use the test project ID created in beforeEach
      await insertDeployAgent(mockDB, {
        id: testAgentId,
        projectId: testProjectId,
        name: 'Test Agent',
        endpoint: 'http://localhost:5678/webhook/test',
        type: 'http',
        auth: { type: 'bearer', token: 'secret' },
      });

      const res = await app.request('/v1/deploy-agents');
      const data: ApiResponse = await res.json();
      const agent = data.data.deploy_agents[0];

      // Type checks
      expect(typeof agent.deploy_agent_id).toBe('string');
      expect(agent.project_id === null || typeof agent.project_id === 'string').toBe(true);
      expect(typeof agent.name).toBe('string');
      expect(typeof agent.endpoint).toBe('string');
      expect(typeof agent.type).toBe('string');
      expect(['idle', 'running', 'error']).toContain(agent.status);
      // auth should be parsed object, not JSON string
      expect(agent.auth === null || typeof agent.auth === 'object').toBe(true);
    });

    it('returns pagination fields', async () => {
      const res = await app.request('/v1/deploy-agents?limit=10&offset=0');
      const data: ApiResponse = await res.json();

      expect(data.data).toHaveProperty('deploy_agents');
      expect(data.data).toHaveProperty('limit');
      expect(data.data).toHaveProperty('offset');
    });
  });

  describe('GET /v1/deploy-agents/:id - Single agent response schema', () => {
    it('returns single agent with snake_case field names', async () => {
      await insertDeployAgent(mockDB, {
        id: testAgentId,
        name: 'Test Agent',
        endpoint: 'http://localhost:5678/webhook/test',
        type: 'http',
      });

      const res = await app.request(`/v1/deploy-agents/${testAgentId}`);
      expect(res.status).toBe(200);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);

      const agent = data.data;
      expect(agent).toHaveProperty('deploy_agent_id');
      expect(agent).toHaveProperty('endpoint');
      expect(agent).toHaveProperty('created_at');
      expect(agent).not.toHaveProperty('deployAgentId');
    });

    it('returns 404 for non-existent agent', async () => {
      const res = await app.request('/v1/deploy-agents/nonexistent');
      expect(res.status).toBe(404);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /v1/deploy-agents - Create agent response schema', () => {
    it('returns created agent with snake_case fields', async () => {
      const res = await app.request('/v1/deploy-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'new-agent',
          name: 'New Agent',
          endpoint: 'http://localhost:5678/webhook/new',
          type: 'http',
        }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);

      const agent = data.data;
      expect(agent).toHaveProperty('deploy_agent_id');
      expect(agent.deploy_agent_id).toBe('new-agent');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('endpoint');
      expect(agent).toHaveProperty('status');
      expect(agent.status).toBe('idle');
    });
  });

  describe('PUT /v1/deploy-agents/:id - Update agent response schema', () => {
    it('returns updated agent with snake_case fields', async () => {
      await insertDeployAgent(mockDB, {
        id: testAgentId,
        name: 'Original Name',
        endpoint: 'http://localhost:5678/webhook/test',
        type: 'http',
      });

      const res = await app.request(`/v1/deploy-agents/${testAgentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Name',
          status: 'running',
        }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);

      const agent = data.data;
      expect(agent.name).toBe('Updated Name');
      expect(agent.status).toBe('running');
      expect(agent).toHaveProperty('updated_at');
    });
  });
});
