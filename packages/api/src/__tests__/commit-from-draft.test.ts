/**
 * Commit-from-Draft Route Tests
 *
 * Integration tests for POST /v1/commit endpoint.
 */

import { REPOSITORY_STATE_POLICY } from '@t3x-dev/application';
import { type ApiKey, parseAcceptancePolicy } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  bindTransitionPolicy,
  ensureMainBranch,
  findBranchByName,
  getRepositoryDecisionAudit,
  getTransitionRefHead,
  insertBranch,
  insertDraft,
  insertProject,
  updateDraft,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

// biome-ignore lint/suspicious/noExplicitAny: test helper
type ApiResponse = any;
type TxRunner = {
  transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
};

// Mock the database module before importing routes
let mockDB: AnyDB;
let requestApiKey: ApiKey | undefined;

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

// Import routes after mocking
import { commitFromDraftRoutes } from '../routes/commit-from-draft.openapi';

describe('Commit-from-Draft Routes', () => {
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  const app = new Hono();
  app.use('*', async (context, next) => {
    if (requestApiKey !== undefined) {
      context.set('apiKey', requestApiKey);
      if (requestApiKey.user_id !== null) context.set('userId', requestApiKey.user_id);
    }
    await next();
  });
  app.route('/', commitFromDraftRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;

    // Create test project
    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Commit-from-Draft Test Project' })
    );
    testProjectId = project.projectId;
    await ensureMainBranch(mockDB, testProjectId);
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    mockDispatch.mockClear();
    requestApiKey = undefined;
  });

  function machineKey(projectId: string, scopes: ApiKey['transition_scopes']): ApiKey {
    return {
      id: 'ak_draft_machine',
      key_prefix: 't3xk_dra',
      key_hash: 'draft-machine-hash',
      name: 'Draft machine',
      project_id: projectId,
      user_id: null,
      principal_kind: 'agent',
      transition_scopes: scopes,
      created_at: '2026-08-29T00:00:00.000Z',
      last_used_at: null,
      revoked_at: null,
    };
  }

  /** Helper: create a draft with tree nodes ready for commit */
  async function createDraftWithTrees(
    projectId: string,
    trees: Array<{ key: string; slots: Record<string, unknown>; children?: unknown[] }>
  ): Promise<string> {
    const draft = await insertDraft(mockDB, {
      project_id: projectId,
      title: 'Test draft for commit',
    });
    await updateDraft(mockDB, draft.id, { nodes: trees }, draft.revision);
    return draft.id;
  }

  describe('POST /v1/commit', () => {
    it('denies an unscoped machine before lazy main-branch creation', async () => {
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Denied machine draft commit' })
      );
      const draftId = await createDraftWithTrees(project.projectId, [
        { key: 's_denied', slots: { text: 'Denied.' }, children: [] },
      ]);
      requestApiKey = machineKey(project.projectId, []);

      const response = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.projectId, draft_id: draftId }),
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

    it('uses the scoped machine actor and server-selected ref policy', async () => {
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Authorized machine draft commit' })
      );
      const binding = await bindTransitionPolicy(mockDB, {
        projectId: project.projectId,
        refName: 'main',
        uri: 't3x://policies/authorized-machine-draft',
        policy: REPOSITORY_STATE_POLICY.policy,
        actor: { kind: 'human', id: 'user:policy-admin' },
      });
      const draftId = await createDraftWithTrees(project.projectId, [
        { key: 's_authorized', slots: { text: 'Authorized.' }, children: [] },
      ]);
      requestApiKey = machineKey(project.projectId, [
        'transition:propose',
        'transition:decide:accept',
        'transition:commit:create',
        'transition:ref:advance',
      ]);

      const response = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.projectId, draft_id: draftId }),
      });

      expect(response.status).toBe(201);
      const head = await getTransitionRefHead(mockDB, {
        projectId: project.projectId,
        refName: 'main',
      });
      expect(head.format).toBe('transition_v2');
      if (head.format !== 'transition_v2') throw new Error('Expected CommitV2 head');
      const audit = await getRepositoryDecisionAudit(mockDB, {
        projectId: project.projectId,
        refName: 'main',
        decisionDigest: head.commit.decision.digest,
      });
      expect(audit).toMatchObject({
        actor: { kind: 'agent', id: 'agent:api-key:ak_draft_machine' },
        policyResource: { digest: binding.resource.digest },
      });
    });

    it('returns a retryable conflict when the selected ref policy is rebound mid-request', async () => {
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Rebound machine draft commit' })
      );
      await bindTransitionPolicy(mockDB, {
        projectId: project.projectId,
        refName: 'main',
        uri: 't3x://policies/rebound-machine-draft/selected',
        policy: REPOSITORY_STATE_POLICY.policy,
        actor: { kind: 'human', id: 'user:policy-admin' },
      });
      const draftId = await createDraftWithTrees(project.projectId, [
        { key: 's_rebound', slots: { text: 'Rebound.' }, children: [] },
      ]);
      requestApiKey = machineKey(project.projectId, [
        'transition:propose',
        'transition:decide:accept',
        'transition:commit:create',
        'transition:ref:advance',
      ]);

      const backingDB = mockDB;
      let rebound = false;
      const bindProperty = (target: object, property: string | symbol) => {
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      };
      mockDB = new Proxy(backingDB as object, {
        get(target, property) {
          if (property !== 'transaction') return bindProperty(target, property);
          return async (runOuter: (tx: unknown) => Promise<unknown>) =>
            (backingDB as unknown as TxRunner).transaction(async (rawTx) => {
              const tx = rawTx as AnyDB;
              const racingTx = new Proxy(tx as object, {
                get(txTarget, txProperty) {
                  if (txProperty !== 'transaction') return bindProperty(txTarget, txProperty);
                  return async (runCommit: (nestedTx: unknown) => Promise<unknown>) => {
                    if (!rebound) {
                      rebound = true;
                      await bindTransitionPolicy(backingDB, {
                        projectId: project.projectId,
                        refName: 'main',
                        uri: 't3x://policies/rebound-machine-draft/replacement',
                        policy: REPOSITORY_STATE_POLICY.policy,
                        actor: { kind: 'human', id: 'user:policy-admin' },
                      });
                    }
                    return (tx as unknown as TxRunner).transaction(runCommit);
                  };
                },
              }) as AnyDB;
              return runOuter(racingTx);
            });
        },
      }) as AnyDB;

      let response: Response;
      try {
        response = await app.request('/v1/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: project.projectId, draft_id: draftId }),
        });
      } finally {
        mockDB = backingDB;
      }

      expect(rebound).toBe(true);
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          code: 'CONFLICT',
          details: { protocol_code: 'TRANSITION_REVIEW_STALE' },
        },
      });
      await expect(
        getTransitionRefHead(backingDB, { projectId: project.projectId, refName: 'main' })
      ).resolves.toMatchObject({ format: 'empty', head: null });
    });

    it('returns policy failures when the server-selected policy denies the Decision', async () => {
      const project = await insertProject(
        mockDB,
        testData.project({ name: 'Restricted machine draft commit' })
      );
      const restrictivePolicy = parseAcceptancePolicy({
        ...REPOSITORY_STATE_POLICY.policy,
        authorization: {
          ...REPOSITORY_STATE_POLICY.policy.authorization,
          decide: {
            actors: {
              mode: 'one_of',
              values: [{ kind: 'human', id: 'human:designated-reviewer' }],
            },
          },
        },
      });
      await bindTransitionPolicy(mockDB, {
        projectId: project.projectId,
        refName: 'main',
        uri: 't3x://policies/restricted-machine-draft',
        policy: restrictivePolicy,
        actor: { kind: 'human', id: 'user:policy-admin' },
      });
      const draftId = await createDraftWithTrees(project.projectId, [
        { key: 's_restricted', slots: { text: 'Restricted.' }, children: [] },
      ]);
      requestApiKey = {
        ...machineKey(project.projectId, []),
        id: 'ak_restricted_human',
        name: 'Restricted human',
        user_id: 'route-reviewer',
        principal_kind: 'human',
      };

      const response = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.projectId, draft_id: draftId }),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: {
          code: 'DECISION_NOT_PERMITTED',
          details: {
            failures: [
              {
                code: 'UNAUTHORIZED_DECISION',
                message: expect.any(String),
              },
            ],
          },
        },
      });
      const head = await getTransitionRefHead(mockDB, {
        projectId: project.projectId,
        refName: 'main',
      });
      expect(head.head).toBeNull();
    });

    it('creates commit from draft (happy path)', async () => {
      const draftId = await createDraftWithTrees(testProjectId, [
        { key: 's_001', slots: { text: 'The deadline is next Friday.' }, children: [] },
        { key: 's_002', slots: { text: 'Budget is $50k.' }, children: [] },
      ]);

      const res = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: draftId,
          message: 'First commit from API',
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.commit_hash).toBeTruthy();
      expect(data.data.commit_hash).toMatch(/^sha256:/);
      expect(data.data.tree_count).toBe(2);
      expect(data.data.branch).toBe('main');
    });

    it('returns 404 for non-existent draft', async () => {
      const res = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: 'draft_nonexistent',
        }),
      });

      expect(res.status).toBe(404);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('fires commit.created webhook', async () => {
      const draftId = await createDraftWithTrees(testProjectId, [
        { key: 's_010', slots: { text: 'Webhook test node.' }, children: [] },
      ]);

      const res = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: draftId,
        }),
      });

      expect(res.status).toBe(201);

      expect(mockDispatch).toHaveBeenCalledWith(
        'commit.created',
        expect.objectContaining({
          project_id: testProjectId,
          commit_hash: expect.any(String),
          tree_count: 1,
          branch: 'main',
        }),
        testProjectId
      );
    });

    it('uses the current branch head as parent when draft has no parent', async () => {
      await insertBranch(mockDB, {
        projectId: testProjectId,
        name: 'feature/parent-fallback',
      });
      const firstDraftId = await createDraftWithTrees(testProjectId, [
        { key: 's_parent', slots: { text: 'Parent node.' }, children: [] },
      ]);
      const firstRes = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: firstDraftId,
          branch: 'feature/parent-fallback',
        }),
      });
      expect(firstRes.status).toBe(201);
      const firstData: ApiResponse = await firstRes.json();

      const secondDraftId = await createDraftWithTrees(testProjectId, [
        { key: 's_child', slots: { text: 'Child node.' }, children: [] },
      ]);
      const secondRes = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: secondDraftId,
          branch: 'feature/parent-fallback',
        }),
      });

      expect(secondRes.status).toBe(201);
      const secondData: ApiResponse = await secondRes.json();
      const secondHead = await getTransitionRefHead(mockDB, {
        projectId: testProjectId,
        refName: 'feature/parent-fallback',
      });
      expect(secondHead.format).toBe('transition_v2');
      if (secondHead.format !== 'transition_v2') throw new Error('Expected CommitV2 head');
      expect(secondHead.commit.parents.map((parent) => parent.digest)).toEqual([
        firstData.data.commit_hash,
      ]);
      expect(secondHead.head).toBe(secondData.data.commit_hash);
    });

    it('uses specified branch (defaults to main)', async () => {
      await insertBranch(mockDB, { projectId: testProjectId, name: 'feature/test' });
      const draftId = await createDraftWithTrees(testProjectId, [
        { key: 's_020', slots: { text: 'Feature branch node.' }, children: [] },
      ]);

      const res = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: draftId,
          branch: 'feature/test',
        }),
      });

      expect(res.status).toBe(201);

      const data: ApiResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.branch).toBe('feature/test');
    });

    it('returns 404 when draft belongs to different project', async () => {
      // Create draft in a different project
      const otherProject = await insertProject(mockDB, testData.project({ name: 'Other Project' }));
      const draftId = await createDraftWithTrees(otherProject.projectId, [
        { key: 's_030', slots: { text: 'Wrong project node.' }, children: [] },
      ]);

      const res = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: draftId,
        }),
      });

      expect(res.status).toBe(404);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns 400 for draft with no trees', async () => {
      const draft = await insertDraft(mockDB, {
        project_id: testProjectId,
        title: 'Empty draft',
      });

      const res = await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: draft.id,
        }),
      });

      expect(res.status).toBe(400);
      const data: ApiResponse = await res.json();
      expect(data.success).toBe(false);
    });

    it('marks draft as committed after successful commit', async () => {
      const { findDraftById } = await import('@t3x-dev/storage');

      const draftId = await createDraftWithTrees(testProjectId, [
        { key: 's_040', slots: { text: 'Check status node.' }, children: [] },
      ]);

      await app.request('/v1/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: testProjectId,
          draft_id: draftId,
        }),
      });

      const updatedDraft = await findDraftById(mockDB, draftId);
      expect(updatedDraft?.status).toBe('committed');
      expect(updatedDraft?.committed_as).toBeTruthy();
    });
  });
});
