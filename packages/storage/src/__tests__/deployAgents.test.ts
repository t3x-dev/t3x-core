import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  deleteDeployAgent,
  findDeployAgentById,
  findDeployAgents,
  insertDeployAgent,
  updateDeployAgent,
  updateDeployAgentRunStatus,
} from '../queries/deployAgents';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

describe('Deploy Agents Storage', () => {
  let db: AnyDB;
  let _client: PGlite;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    _client = setup.client;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Deploy Agents Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // insertDeployAgent
  // =========================================================================
  describe('insertDeployAgent', () => {
    it('creates agent with required fields', async () => {
      const agent = await insertDeployAgent(db, {
        id: 'agent_basic_1',
        name: 'Basic Agent',
        endpoint: 'http://localhost:9000/api',
      });

      expect(agent).toBeDefined();
      expect(agent.deployAgentId).toBe('agent_basic_1');
      expect(agent.name).toBe('Basic Agent');
      expect(agent.endpoint).toBe('http://localhost:9000/api');
      expect(agent.type).toBe('http');
      expect(agent.status).toBe('idle');
      expect(agent.projectId).toBeNull();
      expect(agent.authJson).toBeNull();
      expect(agent.lastRunId).toBeNull();
      expect(agent.lastRunAt).toBeNull();
      expect(agent.createdAt).toBeInstanceOf(Date);
      expect(agent.updatedAt).toBeInstanceOf(Date);
    });

    it('creates agent with all optional fields', async () => {
      const agent = await insertDeployAgent(db, {
        id: 'agent_full_1',
        name: 'Full Agent',
        endpoint: 'ws://localhost:9001',
        type: 'websocket',
        projectId: testProjectId,
        auth: { type: 'bearer', token: 'secret123' },
      });

      expect(agent.type).toBe('websocket');
      expect(agent.projectId).toBe(testProjectId);
      expect(JSON.parse(agent.authJson!)).toEqual({ type: 'bearer', token: 'secret123' });
    });

    it('stores auth with custom header', async () => {
      const agent = await insertDeployAgent(db, {
        id: 'agent_auth_1',
        name: 'API Key Agent',
        endpoint: 'http://example.com',
        auth: { type: 'api_key', token: 'key123', header: 'X-API-Key' },
      });

      const auth = JSON.parse(agent.authJson!);
      expect(auth.type).toBe('api_key');
      expect(auth.header).toBe('X-API-Key');
    });
  });

  // =========================================================================
  // findDeployAgentById
  // =========================================================================
  describe('findDeployAgentById', () => {
    it('returns agent by ID', async () => {
      await insertDeployAgent(db, {
        id: 'agent_find_1',
        name: 'Find Me',
        endpoint: 'http://localhost:8080',
      });

      const found = await findDeployAgentById(db, 'agent_find_1');
      expect(found).toBeDefined();
      expect(found!.name).toBe('Find Me');
    });

    it('returns null for non-existent ID', async () => {
      const found = await findDeployAgentById(db, 'nonexistent');
      expect(found).toBeNull();
    });
  });

  // =========================================================================
  // findDeployAgents
  // =========================================================================
  describe('findDeployAgents', () => {
    let listProjectId: string;

    beforeAll(async () => {
      const project = await insertProject(db, testData.project({ name: 'List Agents Test' }));
      listProjectId = project.projectId;

      await insertDeployAgent(db, {
        id: 'agent_list_1',
        name: 'Agent A',
        endpoint: 'http://a.com',
        projectId: listProjectId,
      });
      await insertDeployAgent(db, {
        id: 'agent_list_2',
        name: 'Agent B',
        endpoint: 'http://b.com',
        projectId: listProjectId,
      });
      await insertDeployAgent(db, {
        id: 'agent_list_3',
        name: 'Agent C',
        endpoint: 'http://c.com',
      });
    });

    it('returns all agents without filter', async () => {
      const agents = await findDeployAgents(db);
      expect(agents.length).toBeGreaterThanOrEqual(3);
    });

    it('filters by projectId', async () => {
      const agents = await findDeployAgents(db, { projectId: listProjectId });
      expect(agents.length).toBe(2);
      expect(agents.every((a) => a.projectId === listProjectId)).toBe(true);
    });

    it('respects limit', async () => {
      const agents = await findDeployAgents(db, { projectId: listProjectId, limit: 1 });
      expect(agents.length).toBe(1);
    });

    it('respects offset', async () => {
      const all = await findDeployAgents(db, { projectId: listProjectId });
      const offset = await findDeployAgents(db, { projectId: listProjectId, offset: 1 });
      expect(offset.length).toBe(1);
      expect(offset[0].deployAgentId).not.toBe(all[0].deployAgentId);
    });
  });

  // =========================================================================
  // updateDeployAgent
  // =========================================================================
  describe('updateDeployAgent', () => {
    it('updates name', async () => {
      await insertDeployAgent(db, {
        id: 'agent_upd_1',
        name: 'Old Name',
        endpoint: 'http://old.com',
      });

      const updated = await updateDeployAgent(db, 'agent_upd_1', { name: 'New Name' });
      expect(updated!.name).toBe('New Name');
    });

    it('updates endpoint and type', async () => {
      await insertDeployAgent(db, {
        id: 'agent_upd_2',
        name: 'Endpoint Test',
        endpoint: 'http://old.com',
      });

      const updated = await updateDeployAgent(db, 'agent_upd_2', {
        endpoint: 'grpc://new.com:9090',
        type: 'grpc',
      });
      expect(updated!.endpoint).toBe('grpc://new.com:9090');
      expect(updated!.type).toBe('grpc');
    });

    it('updates auth', async () => {
      await insertDeployAgent(db, {
        id: 'agent_upd_3',
        name: 'Auth Test',
        endpoint: 'http://test.com',
      });

      const updated = await updateDeployAgent(db, 'agent_upd_3', {
        auth: { type: 'bearer', token: 'new_token' },
      });
      expect(JSON.parse(updated!.authJson!)).toEqual({ type: 'bearer', token: 'new_token' });
    });

    it('clears auth by setting to null', async () => {
      await insertDeployAgent(db, {
        id: 'agent_upd_4',
        name: 'Clear Auth',
        endpoint: 'http://test.com',
        auth: { type: 'bearer', token: 'old' },
      });

      const updated = await updateDeployAgent(db, 'agent_upd_4', { auth: null });
      expect(updated!.authJson).toBeNull();
    });

    it('updates status', async () => {
      await insertDeployAgent(db, {
        id: 'agent_upd_5',
        name: 'Status Test',
        endpoint: 'http://test.com',
      });

      const updated = await updateDeployAgent(db, 'agent_upd_5', { status: 'running' });
      expect(updated!.status).toBe('running');
    });

    it('returns null for non-existent ID', async () => {
      const result = await updateDeployAgent(db, 'nonexistent', { name: 'x' });
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // deleteDeployAgent
  // =========================================================================
  describe('deleteDeployAgent', () => {
    it('deletes existing agent', async () => {
      await insertDeployAgent(db, {
        id: 'agent_del_1',
        name: 'To Delete',
        endpoint: 'http://del.com',
      });

      const deleted = await deleteDeployAgent(db, 'agent_del_1');
      expect(deleted).toBe(true);

      const found = await findDeployAgentById(db, 'agent_del_1');
      expect(found).toBeNull();
    });

    it('returns false for non-existent ID', async () => {
      const deleted = await deleteDeployAgent(db, 'nonexistent');
      expect(deleted).toBe(false);
    });
  });

  // =========================================================================
  // updateDeployAgentRunStatus
  // =========================================================================
  describe('updateDeployAgentRunStatus', () => {
    it('updates status and lastRunId', async () => {
      await insertDeployAgent(db, {
        id: 'agent_run_1',
        name: 'Run Status',
        endpoint: 'http://run.com',
      });

      const updated = await updateDeployAgentRunStatus(db, 'agent_run_1', 'running', 'run_xyz');
      expect(updated!.status).toBe('running');
      expect(updated!.lastRunId).toBe('run_xyz');
      expect(updated!.lastRunAt).toBeInstanceOf(Date);
    });

    it('updates status without lastRunId', async () => {
      await insertDeployAgent(db, {
        id: 'agent_run_2',
        name: 'Status Only',
        endpoint: 'http://run2.com',
      });

      const updated = await updateDeployAgentRunStatus(db, 'agent_run_2', 'error');
      expect(updated!.status).toBe('error');
      expect(updated!.lastRunAt).toBeNull();
    });

    it('returns null for non-existent agent', async () => {
      const result = await updateDeployAgentRunStatus(db, 'nonexistent', 'idle');
      expect(result).toBeNull();
    });
  });
});
