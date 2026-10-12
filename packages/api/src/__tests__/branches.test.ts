/**
 * Branches Route Tests
 */

import type { AnyDB } from '@t3x-dev/storage';
import { bindTransitionPolicy, getTransitionPolicyBinding, insertProject } from '@t3x-dev/storage';
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

import { branchRoutes } from '../routes/branches.openapi';

describe('Branches Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.route('/', branchRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(mockDB, testData.project({ name: 'Branches Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // GET /v1/branches
  // =========================================================================
  describe('GET /v1/branches', () => {
    it('returns 400 without project_id', async () => {
      const res = await app.request('/v1/branches');
      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('backfills main for a project with no registered branches', async () => {
      const res = await app.request(`/v1/branches?project_id=${testProjectId}`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.branches).toEqual([
        expect.objectContaining({ name: 'main', is_current: true }),
      ]);
    });

    it('returns branches after creation', async () => {
      // Create a branch first
      await app.request('/v1/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId, name: 'listed-feature' }),
      });

      const res = await app.request(`/v1/branches?project_id=${testProjectId}`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.branches.map((branch: { name: string }) => branch.name)).toEqual(
        expect.arrayContaining(['main', 'listed-feature'])
      );
    });
  });

  // =========================================================================
  // POST /v1/branches
  // =========================================================================
  describe('POST /v1/branches', () => {
    it('creates a new branch', async () => {
      const res = await app.request('/v1/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          name: 'feature-test',
          description: 'A test branch',
        }),
      });

      expect(res.status).toBe(201);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('feature-test');
      expect(data.data.description).toBe('A test branch');
      expect(data.data.branch_id).toBeDefined();
    });

    it('returns 400 for missing fields', async () => {
      const res = await app.request('/v1/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId }),
      });

      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 404 for non-existent project', async () => {
      const res = await app.request('/v1/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: 'proj_nonexistent', name: 'test' }),
      });

      expect(res.status).toBe(404);
      const data: ApiResponse = await res.json();
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns the existing branch for an identical create intent', async () => {
      const res = await app.request('/v1/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId, name: 'feature-test' }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('feature-test');
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await app.request('/v1/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // GET /v1/branches/current
  // =========================================================================
  describe('GET /v1/branches/current', () => {
    it('returns 400 without project_id', async () => {
      const res = await app.request('/v1/branches/current');
      expect(res.status).toBe(400);
    });

    it('returns current branch after switching', async () => {
      // Switch to main
      await app.request('/v1/branches/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId, branch_name: 'main' }),
      });

      const res = await app.request(`/v1/branches/current?project_id=${testProjectId}`);
      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('main');
      expect(data.data.is_current).toBe(true);
    });
  });

  // =========================================================================
  // POST /v1/branches/switch
  // =========================================================================
  describe('POST /v1/branches/switch', () => {
    it('switches to existing branch', async () => {
      const res = await app.request('/v1/branches/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId, branch_name: 'feature-test' }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('feature-test');
    });

    it('returns 404 for non-existent branch', async () => {
      const res = await app.request('/v1/branches/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId, branch_name: 'no-such-branch' }),
      });

      expect(res.status).toBe(404);
    });

    it('creates branch when create_if_missing is true', async () => {
      const res = await app.request('/v1/branches/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          branch_name: 'auto-created',
          create_if_missing: true,
        }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data.name).toBe('auto-created');
    });

    it('repairs and switches to main when it is missing', async () => {
      const project = await insertProject(mockDB, testData.project({ name: 'Missing Main' }));

      const res = await app.request('/v1/branches/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.projectId, branch_name: 'main' }),
      });

      expect(res.status).toBe(200);
      const data: ApiResponse = await res.json();
      expect(data.data).toMatchObject({ name: 'main', is_current: true });
    });

    it('returns 400 for missing fields', async () => {
      const res = await app.request('/v1/branches/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId }),
      });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // Branch rules
  // =========================================================================
  describe('branch rules', () => {
    async function createBranch(name: string) {
      const res = await app.request('/v1/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId, name }),
      });
      expect(res.status).toBe(201);
    }

    async function listedBranch(name: string) {
      const res = await app.request(`/v1/branches?project_id=${testProjectId}`);
      const data: ApiResponse = await res.json();
      return data.data.branches.find((branch: { name: string }) => branch.name === name);
    }

    function putRules(branchName: string, rules: unknown, target = app) {
      return target.request('/v1/branches/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: testProjectId, branch_name: branchName, rules }),
      });
    }

    it('exposes default commit rules on every branch', async () => {
      await createBranch('rules-default');
      expect((await listedBranch('rules-default')).rules).toEqual({
        commit: { require_independent_review: false, source: 'default' },
      });
    });

    it('toggles independent review and restores the default when lifted', async () => {
      await createBranch('rules-preset');

      const enabled = await putRules('rules-preset', {
        commit: { require_independent_review: true },
      });
      expect(enabled.status).toBe(200);
      expect(((await enabled.json()) as ApiResponse).data.rules.commit).toEqual({
        require_independent_review: true,
        source: 'preset',
      });
      expect((await listedBranch('rules-preset')).rules.commit.source).toBe('preset');
      expect(await getTransitionPolicyBinding(mockDB, testProjectId, 'rules-preset')).not.toBe(
        null
      );

      const lifted = await putRules('rules-preset', {
        commit: { require_independent_review: false },
      });
      expect(((await lifted.json()) as ApiResponse).data.rules.commit.source).toBe('default');
      expect(await getTransitionPolicyBinding(mockDB, testProjectId, 'rules-preset')).toBe(null);
    });

    it('keeps the rest of a custom policy when only self-approval changes', async () => {
      await createBranch('rules-custom');
      await bindTransitionPolicy(mockDB, {
        projectId: testProjectId,
        refName: 'rules-custom',
        uri: 't3x://policies/custom/v1',
        policy: customPolicy(),
        actor: { kind: 'human', id: 'human:admin' },
      });
      expect((await listedBranch('rules-custom')).rules.commit).toEqual({
        require_independent_review: true,
        source: 'custom',
      });

      const res = await putRules('rules-custom', { commit: { require_independent_review: false } });
      expect(((await res.json()) as ApiResponse).data.rules.commit).toEqual({
        require_independent_review: false,
        source: 'custom',
      });
      const stored = await getTransitionPolicyBinding(mockDB, testProjectId, 'rules-custom');
      expect(stored?.policy).toEqual({
        ...customPolicy(),
        authorization: { ...customPolicy().authorization, allowSelfApproval: true },
      });
    });

    it('leaves rules unchanged when a rule kind is omitted', async () => {
      await createBranch('rules-omitted');
      const res = await putRules('rules-omitted', {});
      expect(res.status).toBe(200);
      expect(((await res.json()) as ApiResponse).data.rules.commit.source).toBe('default');
    });

    it('returns 404 for a branch that does not exist', async () => {
      const res = await putRules('rules-missing', { commit: { require_independent_review: true } });
      expect(res.status).toBe(404);
      expect(await getTransitionPolicyBinding(mockDB, testProjectId, 'rules-missing')).toBe(null);
    });

    it('does not let an agent change branch rules', async () => {
      const agentApp = new Hono();
      agentApp.use('*', async (c, next) => {
        c.set(
          'apiKey' as never,
          {
            id: 'ak_rules_agent',
            principal_kind: 'agent',
            project_id: testProjectId,
          } as never
        );
        await next();
      });
      agentApp.route('/', branchRoutes);
      const res = await putRules(
        'main',
        { commit: { require_independent_review: false } },
        agentApp
      );
      expect(res.status).toBe(403);
    });
  });
});

function customPolicy() {
  return {
    schema: 't3x.dev/acceptance-policy/v1' as const,
    version: 1 as const,
    authorization: {
      decide: { actors: { mode: 'any' as const } },
      override: { actors: { mode: 'any' as const } },
      allowSelfApproval: false,
    },
    claims: {
      intent: {
        allowedModes: ['unspecified' as const],
        minimumEvidence: 0,
        humanConfirmation: 'not_required' as const,
      },
      rationale: {
        allowedModes: ['unspecified' as const],
        minimumEvidence: 0,
        humanConfirmation: 'not_required' as const,
      },
    },
    checks: {
      replay: {
        issuers: { mode: 'any' as const },
        tools: { mode: 'any' as const },
        environments: { mode: 'any' as const },
      },
      validation: {
        requirement: 'optional' as const,
        issuers: { mode: 'any' as const },
        tools: { mode: 'any' as const },
        environments: { mode: 'any' as const },
        profiles: { mode: 'any' as const },
        schemas: { mode: 'any' as const },
        contexts: { mode: 'any' as const },
      },
      humanConfirmation: { issuers: { mode: 'any' as const } },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: false,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: false,
    },
  };
}
