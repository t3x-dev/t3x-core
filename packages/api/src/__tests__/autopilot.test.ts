/**
 * Autopilot Route Tests
 *
 * Tests for:
 * - GET  /v1/projects/:projectId/autopilot/config
 * - PUT  /v1/projects/:projectId/autopilot/config
 * - GET  /v1/projects/:projectId/autopilot/adaptive
 * - POST /v1/drafts/:draftId/auto-commit
 */

import { REPOSITORY_STATE_POLICY } from '@t3x-dev/application';
import type { ApiKey } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  bindTransitionPolicy,
  branches,
  ensureMainBranch,
  findBranchByName,
  findDraftById,
  getRepositoryDecisionAudit,
  getTransitionRefHead,
  insertDraft,
  insertProject,
  updateAutopilotConfig,
  updateDraft,
} from '@t3x-dev/storage';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { grantTestMachineProjectAccess, setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;

let mockDB: AnyDB;
let requestApiKey: ApiKey | undefined;

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
  app.use('*', async (context, next) => {
    if (requestApiKey !== undefined) {
      await grantTestMachineProjectAccess(mockDB, requestApiKey);
      context.set('apiKey', requestApiKey);
    }
    await next();
  });
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

  beforeEach(() => {
    requestApiKey = undefined;
  });

  function machineKey(projectId: string, scopes: ApiKey['transition_scopes']): ApiKey {
    return {
      id: 'ak_autopilot_machine',
      key_prefix: 't3xk_aut',
      key_hash: 'autopilot-machine-hash',
      name: 'Autopilot machine',
      project_id: projectId,
      user_id: null,
      principal_kind: 'agent',
      transition_scopes: scopes,
      created_at: '2026-08-29T00:00:00.000Z',
      last_used_at: null,
      revoked_at: null,
    };
  }

  async function createQualifyingAutoCommitDraft(projectId: string, title: string) {
    await updateAutopilotConfig(mockDB, projectId, {
      enabled: true,
      min_nodes: 1,
      target_branch: 'main',
    });
    const draft = await insertDraft(mockDB, { project_id: projectId, title });
    await updateDraft(
      mockDB,
      draft.id,
      {
        extraction_mode: 'llm',
        semantic_points: [
          {
            id: `sp_${draft.id}`,
            text: 'A qualifying state point.',
            zone: 'ready',
            status: 'auto_landed',
            staged: true,
            extraction_mode: 'llm_extracted',
            evidence: [],
            position: 0,
          },
        ],
      },
      draft.revision
    );
    return draft;
  }

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

  // ── POST /v1/drafts/:draftId/auto-commit ──────────────────

  describe('POST /auto-commit', () => {
    it('denies an unscoped machine before lazy branch creation', async () => {
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Denied autopilot machine' })
      );
      const draft = await createQualifyingAutoCommitDraft(
        project.projectId,
        'Denied autopilot draft'
      );
      requestApiKey = machineKey(project.projectId, []);

      const response = await app.request(`/v1/drafts/${draft.id}/auto-commit`, {
        method: 'POST',
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          code: 'FORBIDDEN',
          details: { protocol_code: 'TRANSITION_SCOPE_DENIED' },
        },
      });
      await expect(findBranchByName(mockDB, project.projectId, 'main')).resolves.toBeNull();
    });

    it('audits a scoped machine with the server-selected ref policy', async () => {
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Authorized autopilot machine' })
      );
      const binding = await bindTransitionPolicy(mockDB, {
        projectId: project.projectId,
        refName: 'main',
        uri: 't3x://policies/authorized-autopilot-machine',
        policy: REPOSITORY_STATE_POLICY.policy,
        actor: { kind: 'human', id: 'user:policy-admin' },
      });
      const draft = await createQualifyingAutoCommitDraft(
        project.projectId,
        'Authorized autopilot draft'
      );
      requestApiKey = machineKey(project.projectId, [
        'transition:propose',
        'transition:decide:accept',
        'transition:commit:create',
        'transition:ref:advance',
      ]);

      const response = await app.request(`/v1/drafts/${draft.id}/auto-commit`, {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      const head = await getTransitionRefHead(mockDB, {
        projectId: project.projectId,
        refName: 'main',
      });
      expect(head.format).toBe('transition_v2');
      if (head.format !== 'transition_v2') throw new Error('Expected CommitV2 head');
      await expect(
        getRepositoryDecisionAudit(mockDB, {
          projectId: project.projectId,
          refName: 'main',
          decisionDigest: head.commit.decision.digest,
        })
      ).resolves.toMatchObject({
        actor: { kind: 'agent', id: 'agent:api-key:ak_autopilot_machine' },
        policyResource: { digest: binding.resource.digest },
      });
    });

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
      const draft = await insertDraft(mockDB, {
        project_id: testProjectId,
        title: 'Test Draft for AutoCommit',
      });

      // Set extraction_mode to 'llm' and add semantic points
      await updateDraft(
        mockDB,
        draft.id,
        {
          extraction_mode: 'llm',
          semantic_points: [
            {
              id: 'sp_test1',
              text: 'Test sentence one',
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
      const draft = await insertDraft(mockDB, {
        project_id: testProjectId,
        title: 'Deterministic Draft',
      });

      // Set extraction_mode to 'deterministic'
      await updateDraft(
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
        min_nodes: 1,
        target_branch: 'main',
      });

      // Create a draft with LLM mode and qualifying semantic points
      const draft = await insertDraft(mockDB, {
        project_id: testProjectId,
        title: 'Auto-Commit Draft',
      });

      await updateDraft(
        mockDB,
        draft.id,
        {
          extraction_mode: 'llm',
          semantic_points: [
            {
              id: 'sp_auto1',
              text: 'High confidence sentence',
              zone: 'ready',
              status: 'auto_landed',
              staged: true,
              extraction_mode: 'llm_extracted',
              evidence: [],
              position: 0,
            },
            {
              id: 'sp_auto2',
              text: 'Not-yet-ready sentence',
              // zone 'review' fails the evaluateAutoCommit filter (requires 'ready')
              zone: 'review',
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
      // Only sp_auto1 qualifies; sp_auto2 is skipped because zone !== 'ready'.
      // (Confidence-based filtering was removed in 37d2b5d3 — qualification
      //  now depends on zone/staged/status only.)
      expect(json.data.nodes_committed).toBe(1);
      expect(json.data.nodes_skipped).toBeGreaterThanOrEqual(1);
    });

    it('keeps the draft editable when a corrupt ref head blocks CommitV2 creation', async () => {
      const isolatedProject = await insertProject(
        mockDB,
        testData.project({ name: 'Autopilot Rollback Test' })
      );
      await updateAutopilotConfig(mockDB, isolatedProject.projectId, {
        enabled: true,
        min_nodes: 1,
        target_branch: 'main',
      });

      await ensureMainBranch(mockDB, isolatedProject.projectId);
      await mockDB
        .update(branches)
        .set({ headCommitHash: `sha256:${'f'.repeat(64)}` })
        .where(and(eq(branches.projectId, isolatedProject.projectId), eq(branches.name, 'main')));

      const draft = await insertDraft(mockDB, {
        project_id: isolatedProject.projectId,
        title: 'Auto-Commit Should Roll Back',
      });
      await updateDraft(
        mockDB,
        draft.id,
        {
          extraction_mode: 'llm',
          semantic_points: [
            {
              id: 'sp_rollback',
              text: 'Qualifying sentence',
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

      expect(res.status).toBe(500);
      const reloaded = await findDraftById(mockDB, draft.id);
      expect(reloaded?.status).toBe('editing');
      expect(reloaded?.committed_as).toBeUndefined();
    });
  });
});
