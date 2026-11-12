/** biome-ignore-all lint/suspicious/noExplicitAny: compact API contract assertions */

import { type ApiKey, createYOpsState, prepareMerge, yvalueToTrees } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  bindTransitionPolicy,
  createMaterial,
  createMergeDraft,
  createPullRequest,
  findBranchByName,
  getMergeDraft,
  insertBranch,
  insertProject,
  listCommitHistory,
  replacePullRequestChecks,
  updatePullRequest,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { t3xPrdP0Fixtures } from '@t3x-dev/yschema';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { grantTestScopedCredentialProjectAccess, setupTestDB, testData } from './setup';
import { commitSemanticFixture } from './transition-fixture';

type ApiResponse = any;

let mockDB: AnyDB;
let mockSql: Awaited<ReturnType<typeof setupTestDB>>['sql'];

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import {
  commitRepositoryYOpsMerge,
  commitRepositoryYOpsState,
  getRepositorySemanticCommit,
} from '../lib/repository-state-transition';
import { inspectTransition } from '../lib/transition-control-plane';
import { INDEPENDENT_REVIEW_REF_POLICY } from '../lib/transition-control-plane/applicable-policy';
import {
  decideWorkspaceTransition,
  reviewWorkspaceTransition,
  WorkspaceTransitionReviewStaleError,
} from '../lib/workspace-transition';
import { pullRequestRoutes } from '../routes/pull-requests.openapi';

describe('Pull request routes', () => {
  let requestApiKey: ApiKey | undefined;
  const app = new Hono();
  app.use('*', async (context, next) => {
    if (requestApiKey !== undefined) {
      await grantTestScopedCredentialProjectAccess(mockDB, requestApiKey);
      context.set('apiKey', requestApiKey);
      if (requestApiKey.user_id !== null) context.set('userId', requestApiKey.user_id);
    }
    await next();
  });
  app.route('/', pullRequestRoutes);
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    mockSql = setup.sql;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    requestApiKey = undefined;
  });

  function machineKey(projectId: string, scopes: ApiKey['transition_scopes'] = []): ApiKey {
    return {
      id: 'ak_pr_machine',
      key_prefix: 't3xk_prm',
      key_hash: 'pr-machine-hash',
      name: 'Pull request machine',
      project_id: projectId,
      user_id: null,
      principal_kind: 'agent',
      transition_scopes: scopes,
      created_at: '2026-08-29T00:00:00.000Z',
      last_used_at: null,
      revoked_at: null,
    };
  }

  function humanKey(projectId: string, userId: 'test-a' | 'test-b'): ApiKey {
    return {
      id: `ak_pr_${userId}`,
      key_prefix: `t3xk_${userId}`,
      key_hash: `pr-${userId}-hash`,
      name: `Pull request ${userId}`,
      project_id: projectId,
      user_id: userId,
      principal_kind: 'human',
      transition_scopes: [],
      created_at: '2026-10-30T00:00:00.000Z',
      last_used_at: null,
      revoked_at: null,
    };
  }

  async function createRepositoryCommit(input: {
    projectId: string;
    branch: string;
    content: Parameters<typeof commitSemanticFixture>[1]['content'];
    message: string;
  }) {
    const committed = await commitSemanticFixture(mockDB, {
      projectId: input.projectId,
      refName: input.branch,
      content: input.content,
      intent: input.message,
    });
    return {
      hash: committed.commitDigest,
      content: input.content,
      branch: input.branch,
    };
  }

  async function createWorkspaceCommit(input: {
    projectId: string;
    branch: string;
    workspaceId: string;
    candidate: typeof t3xPrdP0Fixtures.validCandidateTree;
  }) {
    const material = await createMaterial(mockDB, {
      project_id: input.projectId,
      source_type: 'document',
      title: `Source ${input.workspaceId}`,
      content_text: `Source evidence for ${input.workspaceId}`,
      content_hash: `sha256:${input.workspaceId}`,
    });
    const draft = await upsertWorkspaceDraft(mockDB, {
      project_id: input.projectId,
      workspace_id: input.workspaceId,
      title: `Workspace ${input.workspaceId}`,
      target_branch: input.branch,
      workspace_state: {
        id: input.workspaceId,
        projectId: input.projectId,
        title: `Workspace ${input.workspaceId}`,
        targetBranch: input.branch,
        schemaBindings: [
          {
            canonicalName: 't3x/prd',
            version: t3xPrdP0Fixtures.normalizedYSchema.version,
            mode: 'pinned',
          },
        ],
        sourceBundle: [
          {
            id: `material:${material.id}`,
            type: 'document',
            materialId: material.id,
            contentHash: material.content_hash,
          },
        ],
      },
    });
    const content = {
      trees: yvalueToTrees({ prd: structuredClone(input.candidate) }),
      relations: [],
    };
    const actor = { kind: 'human' as const, id: 'human:workspace-pr-test' };
    const reviewed = await reviewWorkspaceTransition(mockDB, {
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      content,
      why: `Commit ${input.workspaceId}`,
      expectedRevision: draft.revision,
      actor,
    });
    const durable = await inspectTransition({
      db: mockDB,
      projectId: input.projectId,
      transitionId: reviewed.transitionId,
      actor,
    });
    expect(durable.transitionId).toBe(reviewed.transitionId);
    expect(durable.precondition.effectDigest).toBe(reviewed.precondition.effectDigest);
    expect(durable.precondition.statementDigests).toEqual(reviewed.precondition.statementDigests);
    await expect(
      decideWorkspaceTransition(mockDB, {
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        transitionId: `trn_${'0'.repeat(32)}`,
        content,
        why: `Commit ${input.workspaceId}`,
        outcome: 'accepted',
        precondition: reviewed.precondition,
        actor,
      })
    ).rejects.toBeInstanceOf(WorkspaceTransitionReviewStaleError);
    const decisionInput = {
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      transitionId: reviewed.transitionId,
      content,
      why: `Commit ${input.workspaceId}`,
      outcome: 'accepted',
      precondition: reviewed.precondition,
      actor,
    } as const;
    const decided = await decideWorkspaceTransition(mockDB, decisionInput);
    if (!decided.commit) throw new Error('Workspace fixture did not create a CommitV2');
    const retried = await decideWorkspaceTransition(mockDB, decisionInput);
    expect(retried.commit).toEqual(decided.commit);
    expect(retried.decisionDigest).toBe(decided.decisionDigest);
    expect(retried.workspace).toEqual(decided.workspace);
    return decided;
  }

  async function mergeRepositoryBranches(input: {
    projectId: string;
    sourceHash: string;
    targetHash: string;
    branch?: string;
  }) {
    return commitRepositoryYOpsMerge({
      db: mockDB,
      projectId: input.projectId,
      refName: input.branch ?? 'main',
      sourceDigest: input.sourceHash,
      targetDigest: input.targetHash,
      decisions: {
        conflictResolutions: {},
        keepFromSource: [],
        keepFromTarget: [],
        keepRelationsFromSource: true,
        keepRelationsFromTarget: true,
      },
      actor: { kind: 'human', id: 'human:test' },
      message: 'test merge',
    });
  }

  async function createBranchFixture(options: { conflict?: boolean } = {}) {
    const project = await insertProject(mockDB, testData.project());
    await insertBranch(mockDB, { projectId: project.projectId, name: 'main' });
    const target = await createRepositoryCommit({
      projectId: project.projectId,
      branch: 'main',
      content: {
        trees: [{ key: 'product', slots: { version: 1 }, children: [] }],
        relations: [],
      },
      message: 'main baseline',
    });

    await insertBranch(mockDB, {
      projectId: project.projectId,
      name: 'feature/pr-flow',
      parentBranch: 'main',
      description: 'Feature PR flow',
    });
    const source = await createRepositoryCommit({
      projectId: project.projectId,
      branch: 'feature/pr-flow',
      content: {
        trees: [
          {
            key: 'product',
            slots: { version: options.conflict ? 2 : 1 },
            children: [],
          },
          { key: 'release', slots: { ready: true }, children: [] },
        ],
        relations: [],
      },
      message: 'feature update',
    });
    const targetHead = options.conflict
      ? await createRepositoryCommit({
          projectId: project.projectId,
          branch: 'main',
          content: {
            trees: [{ key: 'product', slots: { version: 3 }, children: [] }],
            relations: [],
          },
          message: 'conflicting main update',
        })
      : target;
    return { projectId: project.projectId, source, target: targetHead };
  }

  async function openPullRequest(projectId: string, expected?: { source: string; target: string }) {
    const [sourceBranch, targetBranch] = await Promise.all([
      findBranchByName(mockDB, projectId, 'feature/pr-flow'),
      findBranchByName(mockDB, projectId, 'main'),
    ]);
    if (!sourceBranch?.headCommitHash || !targetBranch?.headCommitHash) {
      throw new Error('Pull request fixture branches must have heads');
    }
    const response = await app.request(`/v1/projects/${projectId}/pull-requests`, {
      body: JSON.stringify({
        description: 'Review the feature branch',
        expected_source_commit_id: expected?.source ?? sourceBranch.headCommitHash,
        expected_target_commit_id: expected?.target ?? targetBranch.headCommitHash,
        source_branch: 'feature/pr-flow',
        target_branch: 'main',
        title: 'Feature PR flow',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    return { response, data: (await response.json()) as ApiResponse };
  }

  it('rejects pull request access for a project that does not exist', async () => {
    const response = await app.request('/v1/projects/proj_missing/pull-requests');
    expect(response.status).toBe(404);
    expect(((await response.json()) as ApiResponse).error.code).toBe('NOT_FOUND');
  });

  it('lists real project branches and commit comparisons', async () => {
    const fixture = await createBranchFixture();
    const response = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/compare?base=main`
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as ApiResponse;
    expect(data.data.base_branches).toEqual(expect.arrayContaining(['main', 'feature/pr-flow']));
    expect(data.data.compare_branches).toEqual([
      expect.objectContaining({
        branch: 'feature/pr-flow',
        base_branch: 'main',
        head_commit_id: fixture.source.hash,
        base_commit_id: fixture.target.hash,
        ahead_by: 1,
        behind_by: 0,
        changed_nodes: 1,
        status: 'ready',
      }),
    ]);
  });

  it('measures a diverged branch from the merge base so target-only work is not removed', async () => {
    const fixture = await createBranchFixture();
    const movedTarget = await createRepositoryCommit({
      projectId: fixture.projectId,
      branch: 'main',
      content: {
        trees: [
          { key: 'product', slots: { version: 1 }, children: [] },
          { key: 'pricing', slots: { tier: 'pro' }, children: [] },
        ],
        relations: [],
      },
      message: 'main-only update',
    });
    const response = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/compare?base=main`
    );
    const data = (await response.json()) as ApiResponse;
    expect(data.data.compare_branches).toEqual([
      expect.objectContaining({
        head_commit_id: fixture.source.hash,
        base_commit_id: movedTarget.hash,
        merge_base_commit_id: fixture.target.hash,
        ahead_by: 1,
        behind_by: 1,
        changed_nodes: 1,
        status: 'ready',
      }),
    ]);
  });

  it('keeps the main branch head before listing pull request comparisons', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Main PR project' }));
    await insertBranch(mockDB, { projectId: project.projectId, name: 'main' });
    const target = await createRepositoryCommit({
      projectId: project.projectId,
      branch: 'main',
      content: {
        trees: [{ key: 'product', slots: { version: 1 }, children: [] }],
        relations: [],
      },
      message: 'main baseline',
    });
    await insertBranch(mockDB, {
      projectId: project.projectId,
      name: 'feature/pr-flow',
      parentBranch: 'main',
    });
    await createRepositoryCommit({
      projectId: project.projectId,
      branch: 'feature/pr-flow',
      content: {
        trees: [
          { key: 'product', slots: { version: 1 }, children: [] },
          { key: 'release', slots: { ready: true }, children: [] },
        ],
        relations: [],
      },
      message: 'feature update',
    });

    const response = await app.request(
      `/v1/projects/${project.projectId}/pull-requests/compare?base=main`
    );

    expect(response.status).toBe(200);
    expect((await findBranchByName(mockDB, project.projectId, 'main'))?.headCommitHash).toBe(
      target.hash
    );
    expect(((await response.json()) as ApiResponse).data.base_branches).toContain('main');
  });

  it('does not offer or create a pull request when the source is only behind the target', async () => {
    const fixture = await createBranchFixture();
    await mergeRepositoryBranches({
      projectId: fixture.projectId,
      sourceHash: fixture.source.hash,
      targetHash: fixture.target.hash,
    });

    const comparison = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/compare?base=main`
    );
    const comparisonData = (await comparison.json()) as ApiResponse;
    expect(comparisonData.data.compare_branches).toEqual([
      expect.objectContaining({
        branch: 'feature/pr-flow',
        ahead_by: 0,
        behind_by: 1,
        status: 'no_changes',
        status_label: 'Behind base',
      }),
    ]);

    const opened = await openPullRequest(fixture.projectId);
    expect(opened.response.status).toBe(400);
    expect(opened.data.error.code).toBe('PULL_REQUEST_NO_CHANGES');
  });

  it('recognizes relation-only semantic changes as a valid comparison', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Relation PR project' }));
    await insertBranch(mockDB, { projectId: project.projectId, name: 'main' });
    const trees = [
      { key: 'product', slots: { version: 1 }, children: [] },
      { key: 'release', slots: { ready: true }, children: [] },
    ];
    const target = await createRepositoryCommit({
      projectId: project.projectId,
      branch: 'main',
      content: { trees, relations: [] },
      message: 'relation baseline',
    });
    await insertBranch(mockDB, {
      projectId: project.projectId,
      name: 'feature/pr-flow',
      parentBranch: 'main',
    });
    const source = await createRepositoryCommit({
      projectId: project.projectId,
      branch: 'feature/pr-flow',
      content: {
        trees,
        relations: [{ from: 'release', to: 'product', type: 'depends' }],
      },
      message: 'add relation',
    });

    const comparison = await app.request(
      `/v1/projects/${project.projectId}/pull-requests/compare?base=main`
    );
    const comparisonData = (await comparison.json()) as ApiResponse;
    expect(comparisonData.data.compare_branches).toEqual([
      expect.objectContaining({ status: 'ready', changed_nodes: 0 }),
    ]);

    const opened = await openPullRequest(project.projectId, {
      source: source.hash,
      target: target.hash,
    });
    expect(opened.response.status).toBe(201);
  });

  it('returns an empty comparison set when the base branch has no commits yet', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Empty PR project' }));
    await insertBranch(mockDB, { projectId: project.projectId, name: 'main' });

    const response = await app.request(
      `/v1/projects/${project.projectId}/pull-requests/compare?base=main`
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as ApiResponse).data).toEqual({
      base_branches: ['main'],
      compare_branches: [],
    });
  });

  it('lists a lone base branch without decoding an older non-semantic head', async () => {
    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Legacy lone base PR project' })
    );
    await insertBranch(mockDB, { projectId: project.projectId, name: 'main' });
    await commitRepositoryYOpsState({
      db: mockDB,
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      target: createYOpsState({ prd: { summary: { problem: 'Older Workspace State' } } }),
      actor: { kind: 'human', id: 'human:legacy-workspace-fixture' },
      intent: 'Preserve a pre-fix Workspace State fixture',
    });

    const response = await app.request(
      `/v1/projects/${project.projectId}/pull-requests/compare?base=main`
    );

    expect(response.status).toBe(200);
    expect(((await response.json()) as ApiResponse).data).toEqual({
      base_branches: ['main'],
      compare_branches: [],
    });
  });

  it('lists an inherited branch with the same older non-semantic head as no changes', async () => {
    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Legacy inherited branch PR project' })
    );
    await insertBranch(mockDB, { projectId: project.projectId, name: 'main' });
    const committed = await commitRepositoryYOpsState({
      db: mockDB,
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      target: createYOpsState({ prd: { summary: { problem: 'Older Workspace State' } } }),
      actor: { kind: 'human', id: 'human:legacy-workspace-fixture' },
      intent: 'Preserve a pre-fix Workspace State fixture',
    });
    await insertBranch(mockDB, {
      projectId: project.projectId,
      name: 'feature/empty',
      parentBranch: 'main',
    });

    const response = await app.request(
      `/v1/projects/${project.projectId}/pull-requests/compare?base=main`
    );

    expect(response.status).toBe(200);
    expect(((await response.json()) as ApiResponse).data).toEqual({
      base_branches: ['main', 'feature/empty'],
      compare_branches: [
        expect.objectContaining({
          branch: 'feature/empty',
          base_branch: 'main',
          head_commit_id: committed.commitDigest,
          base_commit_id: committed.commitDigest,
          ahead_by: 0,
          behind_by: 0,
          changed_nodes: 0,
          status: 'no_changes',
          status_label: 'No semantic changes',
        }),
      ],
    });
  });

  it('compares branches created through the real Workspace CommitV2 flow', async () => {
    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Workspace to PR comparison' })
    );
    await insertBranch(mockDB, { projectId: project.projectId, name: 'main' });
    await createWorkspaceCommit({
      projectId: project.projectId,
      branch: 'main',
      workspaceId: 'workspace-pr-main',
      candidate: t3xPrdP0Fixtures.validCandidateTree,
    });

    const onlyMain = await app.request(
      `/v1/projects/${project.projectId}/pull-requests/compare?base=main`
    );
    expect(onlyMain.status).toBe(200);
    expect(((await onlyMain.json()) as ApiResponse).data).toEqual({
      base_branches: ['main'],
      compare_branches: [],
    });

    await insertBranch(mockDB, {
      projectId: project.projectId,
      name: 'feature/workspace-pr',
      parentBranch: 'main',
    });
    const featureCandidate = structuredClone(t3xPrdP0Fixtures.validCandidateTree);
    featureCandidate.summary.outcome = 'Workspace commits remain comparable by pull requests.';
    await createWorkspaceCommit({
      projectId: project.projectId,
      branch: 'feature/workspace-pr',
      workspaceId: 'workspace-pr-feature',
      candidate: featureCandidate,
    });

    const withFeature = await app.request(
      `/v1/projects/${project.projectId}/pull-requests/compare?base=main`
    );
    expect(withFeature.status).toBe(200);
    const data = (await withFeature.json()) as ApiResponse;
    expect(data.data.base_branches).toEqual(['main', 'feature/workspace-pr']);
    expect(data.data.compare_branches).toEqual([
      expect.objectContaining({
        branch: 'feature/workspace-pr',
        base_branch: 'main',
        ahead_by: 1,
        behind_by: 0,
        status: 'ready',
      }),
    ]);
  });

  it('lists committed source branches when the selected base branch is empty', async () => {
    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Empty main PR project' })
    );
    await insertBranch(mockDB, { projectId: project.projectId, name: 'main' });
    await insertBranch(mockDB, {
      projectId: project.projectId,
      name: 'feature/first-commit',
      parentBranch: 'main',
    });
    const source = await createRepositoryCommit({
      projectId: project.projectId,
      branch: 'feature/first-commit',
      content: {
        trees: [{ key: 'product', slots: { version: 1 }, children: [] }],
        relations: [],
      },
      message: 'first feature commit',
    });

    const response = await app.request(
      `/v1/projects/${project.projectId}/pull-requests/compare?base=main`
    );
    const data = (await response.json()) as ApiResponse;

    expect(response.status).toBe(200);
    expect(data.data.base_branches).toEqual(['main', 'feature/first-commit']);
    expect(data.data.compare_branches).toEqual([
      expect.objectContaining({
        branch: 'feature/first-commit',
        head_commit_id: source.hash,
        base_commit_id: null,
        status: 'base_empty',
        status_label: 'Base has no commit',
      }),
    ]);
  });

  it('creates and reloads a persistent pull request from branch heads', async () => {
    const fixture = await createBranchFixture();
    const { response, data } = await openPullRequest(fixture.projectId);
    expect(response.status).toBe(201);
    expect(data.data).toMatchObject({
      number: 1,
      source_commit_id: fixture.source.hash,
      target_base_commit_id: fixture.target.hash,
      status: 'ready',
    });
    expect(data.data.merge_draft_id).toMatch(/^mdraft_/);
    expect(data.data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'source_commit', status: 'passed' }),
        expect.objectContaining({ kind: 'merge_simulation', status: 'passed' }),
      ])
    );

    const detail = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${data.data.number}`
    );
    const detailData = (await detail.json()) as ApiResponse;
    expect(detail.status).toBe(200);
    expect(detailData.data.id).toBe(data.data.id);
    expect(detailData.data.activity).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'created' })])
    );

    const list = await app.request(`/v1/projects/${fixture.projectId}/pull-requests`);
    const listData = (await list.json()) as ApiResponse;
    expect(listData.data.counts).toEqual({ active: 1, merged: 0 });
    expect(listData.data.pull_requests[0].id).toBe(data.data.id);
  });

  it('rejects creation when a previewed branch head has moved', async () => {
    const fixture = await createBranchFixture();
    await createRepositoryCommit({
      projectId: fixture.projectId,
      branch: 'feature/pr-flow',
      content: {
        trees: [
          { key: 'product', slots: { version: 1 }, children: [] },
          { key: 'release', slots: { ready: true, amended: true }, children: [] },
        ],
        relations: [],
      },
      message: 'source moved after preview',
    });

    const opened = await openPullRequest(fixture.projectId, {
      source: fixture.source.hash,
      target: fixture.target.hash,
    });
    expect(opened.response.status).toBe(409);
    expect(opened.data.error.code).toBe('PULL_REQUEST_BRANCH_HEAD_CHANGED');
  });

  it('rejects duplicate active pull requests for the same branch pair', async () => {
    const fixture = await createBranchFixture();
    expect((await openPullRequest(fixture.projectId)).response.status).toBe(201);
    const duplicate = await openPullRequest(fixture.projectId);
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.data.error.code).toBe('PULL_REQUEST_ALREADY_EXISTS');
  });

  it('persists deterministic readiness, merge draft, and close activity', async () => {
    const fixture = await createBranchFixture();
    const opened = await openPullRequest(fixture.projectId);
    const number = opened.data.data.number;

    const rerun = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/checks/rerun`,
      { method: 'POST' }
    );
    expect(rerun.status).toBe(200);
    const readiness = (await rerun.json()) as ApiResponse;
    expect(readiness.data.status).toBe('ready');
    expect(readiness.data.merge_draft_id).toMatch(/^mdraft_/);
    expect(readiness.data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'merge_simulation', status: 'passed' }),
        expect.objectContaining({ kind: 'conflict_resolution', status: 'passed' }),
      ])
    );

    const closed = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/close`,
      { method: 'POST' }
    );
    expect(closed.status).toBe(200);
    expect(((await closed.json()) as ApiResponse).data.status).toBe('closed');

    const detail = await app.request(`/v1/projects/${fixture.projectId}/pull-requests/${number}`);
    const detailData = (await detail.json()) as ApiResponse;
    expect(detailData.data.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'checks_reran' }),
        expect.objectContaining({ type: 'closed' }),
      ])
    );
  });

  it('serializes readiness and close so a closed PR cannot remain checking', async () => {
    const fixture = await createBranchFixture();
    const opened = await openPullRequest(fixture.projectId);
    const number = opened.data.data.number;

    const [rerun, close] = await Promise.all([
      app.request(`/v1/projects/${fixture.projectId}/pull-requests/${number}/checks/rerun`, {
        method: 'POST',
      }),
      app.request(`/v1/projects/${fixture.projectId}/pull-requests/${number}/close`, {
        method: 'POST',
      }),
    ]);

    expect(close.status).toBe(200);
    expect([200, 409]).toContain(rerun.status);
    const detail = await app.request(`/v1/projects/${fixture.projectId}/pull-requests/${number}`);
    expect(((await detail.json()) as ApiResponse).data.status).toBe('closed');
  });

  it('blocks readiness when deterministic preparation finds unresolved conflicts', async () => {
    const fixture = await createBranchFixture({ conflict: true });
    const opened = await openPullRequest(fixture.projectId);
    const rerun = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${opened.data.data.number}/checks/rerun`,
      { method: 'POST' }
    );
    expect(rerun.status).toBe(200);
    const readiness = (await rerun.json()) as ApiResponse;
    expect(readiness.data.status).toBe('blocked');
    expect(readiness.data.merge_draft_id).toMatch(/^mdraft_/);
    expect(readiness.data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'merge_simulation', status: 'passed' }),
        expect.objectContaining({ kind: 'conflict_resolution', status: 'blocked' }),
      ])
    );
  });

  it('merges a blocked pull request after every structural conflict is resolved', async () => {
    const fixture = await createBranchFixture({ conflict: true });
    const opened = await openPullRequest(fixture.projectId);
    const number = opened.data.data.number;
    const rerun = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/checks/rerun`,
      { method: 'POST' }
    );
    const readiness = (await rerun.json()) as ApiResponse;
    expect(rerun.status).toBe(200);
    expect(readiness.data.status).toBe('blocked');

    const response = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/merge`,
      {
        body: JSON.stringify({
          expected_source_commit_id: fixture.source.hash,
          expected_target_commit_id: fixture.target.hash,
          strategy: 'deterministic_merge',
          decisions: {
            conflictResolutions: { product: 'source' },
            keepFromSource: ['release'],
            keepFromTarget: [],
            keepRelationsFromSource: true,
            keepRelationsFromTarget: true,
          },
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }
    );

    expect(response.status).toBe(200);
    const merged = (await response.json()) as ApiResponse;
    expect(merged.data.status).toBe('merged');
    expect(merged.data.merge_commit_id).toMatch(/^sha256:/);
    expect(
      (await app.request(`/v1/projects/${fixture.projectId}/pull-requests/${number}/merge-review`))
        .status
    ).toBe(200);
    const mergeCommit = await getRepositorySemanticCommit(
      mockDB,
      merged.data.merge_commit_id,
      fixture.projectId
    );
    expect(mergeCommit?.parents).toEqual([fixture.target.hash, fixture.source.hash]);
    expect(mergeCommit?.semanticContent.trees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'product', slots: { version: 2 } }),
        expect.objectContaining({ key: 'release', slots: { ready: true } }),
      ])
    );
  });

  it('detects conflicts when the pull request opens and explains them per slot', async () => {
    const fixture = await createBranchFixture({ conflict: true });
    const opened = await openPullRequest(fixture.projectId);
    expect(opened.response.status).toBe(201);
    expect(opened.data.data.status).toBe('blocked');
    expect(opened.data.data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'conflict_resolution', status: 'blocked' }),
      ])
    );

    const review = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${opened.data.data.number}/merge-review`
    );
    expect(review.status).toBe(200);
    const reviewData = (await review.json()) as ApiResponse;
    expect(reviewData.data.draft_id).toBe(opened.data.data.merge_draft_id);
    expect(reviewData.data.merge_base_commit_id).toMatch(/^sha256:/);
    expect(reviewData.data.nodes).toEqual([
      {
        path: 'product',
        status: 'conflict',
        presence: { base: true, source: true, target: true },
        slots: [{ key: 'version', base: 1, source: 2, target: 3, conflict: true }],
      },
      {
        path: 'release',
        status: 'source_only',
        presence: { base: false, source: true, target: false },
        slots: [{ key: 'ready', source: true, merged: true, conflict: false }],
      },
    ]);
  });

  it('refuses to merge while a conflict has no decision and accepts a custom value', async () => {
    const fixture = await createBranchFixture({ conflict: true });
    const opened = await openPullRequest(fixture.projectId);
    const number = opened.data.data.number;
    const merge = (conflictResolutions: Record<string, unknown>) =>
      app.request(`/v1/projects/${fixture.projectId}/pull-requests/${number}/merge`, {
        body: JSON.stringify({
          expected_source_commit_id: fixture.source.hash,
          expected_target_commit_id: fixture.target.hash,
          strategy: 'deterministic_merge',
          decisions: {
            conflictResolutions,
            keepFromSource: ['release'],
            keepFromTarget: [],
            keepRelationsFromSource: true,
            keepRelationsFromTarget: true,
          },
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

    const unresolved = await merge({});
    expect(unresolved.status).toBe(409);
    expect(((await unresolved.json()) as ApiResponse).error.code).toBe('UNRESOLVED_CONFLICTS');

    const custom = await merge({
      product: { edit: { key: 'product', slots: { version: 7 }, children: [] } },
    });
    expect(custom.status).toBe(200);
    const merged = (await custom.json()) as ApiResponse;
    const mergeCommit = await getRepositorySemanticCommit(
      mockDB,
      merged.data.merge_commit_id,
      fixture.projectId
    );
    expect(mergeCommit?.semanticContent.trees).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'product', slots: { version: 7 } })])
    );
  });

  it('denies an unscoped machine merge without mutating the reviewed PR or draft', async () => {
    const fixture = await createBranchFixture();
    const opened = await openPullRequest(fixture.projectId);
    const number = opened.data.data.number;
    const readinessResponse = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/checks/rerun`,
      { method: 'POST' }
    );
    const readiness = (await readinessResponse.json()) as ApiResponse;
    expect(readinessResponse.status).toBe(200);
    expect(readiness.data.status).toBe('ready');
    requestApiKey = machineKey(fixture.projectId);

    const response = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/merge`,
      {
        body: JSON.stringify({
          expected_source_commit_id: fixture.source.hash,
          expected_target_commit_id: fixture.target.hash,
          strategy: 'deterministic_merge',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }
    );

    expect(response.status).toBe(403);
    expect((await response.json()) as ApiResponse).toMatchObject({
      success: false,
      error: { code: 'TRANSITION_SCOPE_DENIED' },
    });
    expect((await findBranchByName(mockDB, fixture.projectId, 'main'))?.headCommitHash).toBe(
      fixture.target.hash
    );
    expect((await getMergeDraft(mockDB, readiness.data.merge_draft_id))?.status).toBe('pending');
    requestApiKey = undefined;
    const detail = await app.request(`/v1/projects/${fixture.projectId}/pull-requests/${number}`);
    expect(((await detail.json()) as ApiResponse).data).toMatchObject({
      status: 'ready',
      merge_commit_id: null,
    });
  });

  it('authorizes machine PR creation and readiness with separate proposal and verification scopes', async () => {
    const fixture = await createBranchFixture();
    requestApiKey = machineKey(fixture.projectId);
    const deniedCreate = await openPullRequest(fixture.projectId);
    expect(deniedCreate.response.status).toBe(403);
    expect(deniedCreate.data.error.code).toBe('TRANSITION_SCOPE_DENIED');

    requestApiKey = machineKey(fixture.projectId, ['transition:propose']);
    const opened = await openPullRequest(fixture.projectId);
    expect(opened.response.status).toBe(201);
    expect(opened.data.data).toMatchObject({
      author_kind: 'agent',
      status: 'open',
    });

    const rerun = () =>
      app.request(
        `/v1/projects/${fixture.projectId}/pull-requests/${opened.data.data.number}/checks/rerun`,
        { method: 'POST' }
      );
    const deniedReadiness = await rerun();
    expect(deniedReadiness.status).toBe(403);
    expect(((await deniedReadiness.json()) as ApiResponse).error.code).toBe(
      'TRANSITION_SCOPE_DENIED'
    );

    requestApiKey = machineKey(fixture.projectId, ['transition:verify']);
    const verified = await rerun();
    expect(verified.status).toBe(200);
    expect(((await verified.json()) as ApiResponse).data).toMatchObject({ status: 'ready' });
  });

  it('rejects unresolved conflicts without changing the target branch or merge draft', async () => {
    const fixture = await createBranchFixture({ conflict: true });
    const opened = await openPullRequest(fixture.projectId);
    const number = opened.data.data.number;
    const rerun = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/checks/rerun`,
      { method: 'POST' }
    );
    const readiness = (await rerun.json()) as ApiResponse;
    const draftId = readiness.data.merge_draft_id;

    const response = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/merge`,
      {
        body: JSON.stringify({
          expected_source_commit_id: fixture.source.hash,
          expected_target_commit_id: fixture.target.hash,
          strategy: 'deterministic_merge',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }
    );

    expect(response.status).toBe(409);
    expect(((await response.json()) as ApiResponse).error.code).toBe('PULL_REQUEST_NOT_READY');
    expect((await findBranchByName(mockDB, fixture.projectId, 'main'))?.headCommitHash).toBe(
      fixture.target.hash
    );
    expect((await getMergeDraft(mockDB, draftId))?.status).toBe('pending');
    expect(await listCommitHistory(mockDB, fixture.projectId)).toHaveLength(3);
  });

  it('records persisted-decision failures as blocked instead of leaving a PR checking', async () => {
    const fixture = await createBranchFixture();
    const opened = await openPullRequest(fixture.projectId);
    const number = opened.data.data.number;
    const firstRerun = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/checks/rerun`,
      { method: 'POST' }
    );
    const prepared = (await firstRerun.json()) as ApiResponse;
    await mockSql.unsafe('UPDATE merge_drafts SET decision_json = $1 WHERE draft_id = $2', [
      '{invalid-json',
      prepared.data.merge_draft_id,
    ]);

    const failedRerun = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/checks/rerun`,
      { method: 'POST' }
    );
    const failed = (await failedRerun.json()) as ApiResponse;

    expect(failedRerun.status).toBe(200);
    expect(failed.data).toMatchObject({ status: 'blocked', merge_draft_id: null });
    expect(failed.data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'merge_simulation', status: 'failed' }),
      ])
    );
  });

  it('refreshes the reviewed snapshots when a branch moved after PR creation', async () => {
    const fixture = await createBranchFixture();
    const opened = await openPullRequest(fixture.projectId);
    const movedTarget = await createRepositoryCommit({
      projectId: fixture.projectId,
      branch: 'main',
      content: {
        trees: [{ key: 'product', slots: { version: 1, patch: true }, children: [] }],
        relations: [],
      },
      message: 'target moved',
    });

    const rerun = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${opened.data.data.number}/checks/rerun`,
      { method: 'POST' }
    );
    expect(rerun.status).toBe(200);
    const readiness = (await rerun.json()) as ApiResponse;
    expect(readiness.data).toMatchObject({
      status: 'ready',
      source_commit_id: fixture.source.hash,
      target_base_commit_id: movedTarget.hash,
    });
    expect(readiness.data.merge_draft_id).toBeTruthy();
    expect(readiness.data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'base_freshness', status: 'passed' }),
      ])
    );
    expect(readiness.data.activity).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'base_updated' })])
    );
  });

  it('atomically creates a double-parent commit and completes a ready pull request', async () => {
    const fixture = await createBranchFixture();
    const opened = await openPullRequest(fixture.projectId);
    const number = opened.data.data.number;
    const readiness = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/checks/rerun`,
      { method: 'POST' }
    );
    expect(readiness.status).toBe(200);
    expect(((await readiness.json()) as ApiResponse).data.status).toBe('ready');

    const response = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/merge`,
      {
        body: JSON.stringify({
          expected_source_commit_id: fixture.source.hash,
          expected_target_commit_id: fixture.target.hash,
          strategy: 'deterministic_merge',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }
    );
    expect(response.status).toBe(200);
    const merged = (await response.json()) as ApiResponse;
    expect(merged.data.status).toBe('merged');
    expect(merged.data.merge_commit_id).toMatch(/^sha256:/);
    expect(merged.data.activity).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'merged' })])
    );

    const mergeCommit = await getRepositorySemanticCommit(
      mockDB,
      merged.data.merge_commit_id,
      fixture.projectId
    );
    expect(mergeCommit?.parents).toEqual([fixture.target.hash, fixture.source.hash]);
    expect((await findBranchByName(mockDB, fixture.projectId, 'main'))?.headCommitHash).toBe(
      mergeCommit?.digest
    );
    expect(
      (await findBranchByName(mockDB, fixture.projectId, 'feature/pr-flow'))?.headCommitHash
    ).toBe(fixture.source.hash);
  });

  it('merges multiple source commits into a protected ref only after test-b reviews test-a, with structured audit', async () => {
    const fixture = await createBranchFixture();
    const secondSource = await createRepositoryCommit({
      projectId: fixture.projectId,
      branch: 'feature/pr-flow',
      content: {
        trees: [
          { key: 'product', slots: { version: 1 }, children: [] },
          { key: 'release', slots: { ready: true, audited: true }, children: [] },
          { key: 'operations', slots: { owner: 'test-a' }, children: [] },
        ],
        relations: [],
      },
      message: 'second feature commit',
    });
    await bindTransitionPolicy(mockDB, {
      projectId: fixture.projectId,
      refName: 'main',
      uri: INDEPENDENT_REVIEW_REF_POLICY.resource.uri,
      policy: INDEPENDENT_REVIEW_REF_POLICY.policy,
      actor: { kind: 'human', id: 'human:admin' },
    });

    requestApiKey = humanKey(fixture.projectId, 'test-a');
    const opened = await openPullRequest(fixture.projectId);
    expect(opened.response.status).toBe(201);
    expect(opened.data.data).toMatchObject({
      author_id: 'user:test-a',
      author_kind: 'human',
      source_commit_id: secondSource.hash,
      status: 'ready',
    });

    const merge = () =>
      app.request(
        `/v1/projects/${fixture.projectId}/pull-requests/${opened.data.data.number}/merge`,
        {
          body: JSON.stringify({
            expected_source_commit_id: secondSource.hash,
            expected_target_commit_id: fixture.target.hash,
            strategy: 'deterministic_merge',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }
      );

    const selfApproval = await merge();
    expect(selfApproval.status).toBe(409);
    expect(((await selfApproval.json()) as ApiResponse).error.code).toBe('DECISION_NOT_PERMITTED');
    expect((await findBranchByName(mockDB, fixture.projectId, 'main'))?.headCommitHash).toBe(
      fixture.target.hash
    );

    requestApiKey = humanKey(fixture.projectId, 'test-b');
    const approved = await merge();
    const merged = (await approved.json()) as ApiResponse;
    expect(approved.status).toBe(200);
    expect(merged.data.status).toBe('merged');
    expect(merged.data.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor_id: 'user:test-a',
          type: 'created',
          details: expect.objectContaining({
            source_commit_id: secondSource.hash,
            target_commit_id: fixture.target.hash,
          }),
        }),
        expect.objectContaining({
          actor_id: 'user:test-b',
          type: 'merged',
          details: expect.objectContaining({
            proposal_actor: { kind: 'human', id: 'user:test-a' },
            source_commit_id: secondSource.hash,
            target_commit_id: fixture.target.hash,
            merge_commit_id: merged.data.merge_commit_id,
            outcome: 'merged',
          }),
        }),
      ])
    );
    const mergeCommit = await getRepositorySemanticCommit(
      mockDB,
      merged.data.merge_commit_id,
      fixture.projectId
    );
    expect(mergeCommit?.parents).toEqual([fixture.target.hash, secondSource.hash]);
    expect(await listCommitHistory(mockDB, fixture.projectId)).toHaveLength(4);
  });

  it('serializes concurrent merge requests so exactly one merge commit is created', async () => {
    const fixture = await createBranchFixture();
    const opened = await openPullRequest(fixture.projectId);
    const number = opened.data.data.number;
    await app.request(`/v1/projects/${fixture.projectId}/pull-requests/${number}/checks/rerun`, {
      method: 'POST',
    });
    const request = () =>
      app.request(`/v1/projects/${fixture.projectId}/pull-requests/${number}/merge`, {
        body: JSON.stringify({
          expected_source_commit_id: fixture.source.hash,
          expected_target_commit_id: fixture.target.hash,
          strategy: 'deterministic_merge',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

    const responses = await Promise.all([request(), request()]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await listCommitHistory(mockDB, fixture.projectId)).toHaveLength(3);

    const detail = await app.request(`/v1/projects/${fixture.projectId}/pull-requests/${number}`);
    const data = (await detail.json()) as ApiResponse;
    expect(data.data.status).toBe('merged');
    expect(data.data.activity.filter((item: ApiResponse) => item.type === 'merged')).toHaveLength(
      1
    );
  });

  it('blocks merge when the source branch moved after readiness', async () => {
    const fixture = await createBranchFixture();
    const opened = await openPullRequest(fixture.projectId);
    const number = opened.data.data.number;
    await app.request(`/v1/projects/${fixture.projectId}/pull-requests/${number}/checks/rerun`, {
      method: 'POST',
    });
    const movedSource = await createRepositoryCommit({
      projectId: fixture.projectId,
      branch: 'feature/pr-flow',
      content: {
        trees: [
          { key: 'product', slots: { version: 1 }, children: [] },
          { key: 'release', slots: { ready: true, amended: true }, children: [] },
        ],
        relations: [],
      },
      message: 'source moved',
    });

    const response = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/merge`,
      {
        body: JSON.stringify({
          expected_source_commit_id: fixture.source.hash,
          expected_target_commit_id: fixture.target.hash,
          strategy: 'deterministic_merge',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }
    );
    expect(response.status).toBe(409);
    expect(((await response.json()) as ApiResponse).error.code).toBe('PULL_REQUEST_HEAD_CHANGED');
    expect((await findBranchByName(mockDB, fixture.projectId, 'main'))?.headCommitHash).toBe(
      fixture.target.hash
    );

    const detail = await app.request(`/v1/projects/${fixture.projectId}/pull-requests/${number}`);
    expect(((await detail.json()) as ApiResponse).data).toMatchObject({
      status: 'blocked',
      merge_draft_id: null,
      merge_commit_id: null,
    });

    const refreshed = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/checks/rerun`,
      { method: 'POST' }
    );
    expect(refreshed.status).toBe(200);
    expect(((await refreshed.json()) as ApiResponse).data).toMatchObject({
      status: 'ready',
      source_commit_id: movedSource.hash,
      target_base_commit_id: fixture.target.hash,
    });
  });

  it('rejects stale expected heads without creating a merge commit', async () => {
    const fixture = await createBranchFixture();
    const opened = await openPullRequest(fixture.projectId);
    const number = opened.data.data.number;
    await app.request(`/v1/projects/${fixture.projectId}/pull-requests/${number}/checks/rerun`, {
      method: 'POST',
    });

    const response = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/merge`,
      {
        body: JSON.stringify({
          expected_source_commit_id: 'sha256:stale',
          expected_target_commit_id: fixture.target.hash,
          strategy: 'deterministic_merge',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }
    );
    expect(response.status).toBe(409);
    expect(((await response.json()) as ApiResponse).error.code).toBe(
      'PULL_REQUEST_EXPECTATION_MISMATCH'
    );
    expect((await findBranchByName(mockDB, fixture.projectId, 'main'))?.headCommitHash).toBe(
      fixture.target.hash
    );

    const detail = await app.request(`/v1/projects/${fixture.projectId}/pull-requests/${number}`);
    expect(((await detail.json()) as ApiResponse).data).toMatchObject({
      status: 'ready',
      merge_commit_id: null,
    });
  });

  it('blocks a historical ready PR with missing Schema contract evidence', async () => {
    const project = await insertProject(
      mockDB,
      testData.project({ name: 'Historical PR Schema demo' })
    );
    await insertBranch(mockDB, { projectId: project.projectId, name: 'main' });
    await createWorkspaceCommit({
      projectId: project.projectId,
      branch: 'main',
      workspaceId: 'historical-pr-base',
      candidate: t3xPrdP0Fixtures.validCandidateTree,
    });
    await insertBranch(mockDB, {
      projectId: project.projectId,
      name: 'dev',
      parentBranch: 'main',
    });
    const devCandidate = structuredClone(t3xPrdP0Fixtures.validCandidateTree);
    devCandidate.summary.outcome = 'Old dev change';
    const baseContent = {
      trees: yvalueToTrees({ prd: t3xPrdP0Fixtures.validCandidateTree }),
      relations: [],
    };
    const devContent = { trees: yvalueToTrees({ prd: devCandidate }), relations: [] };
    const source = await createRepositoryCommit({
      projectId: project.projectId,
      branch: 'dev',
      content: devContent,
      message: 'Legacy dev commit without Schema contract',
    });
    const oldMain = (await findBranchByName(mockDB, project.projectId, 'main'))!.headCommitHash!;
    const draft = await createMergeDraft(mockDB, {
      projectId: project.projectId,
      sourceHash: source.hash,
      targetHash: oldMain,
      sourceBranch: 'dev',
      targetBranch: 'main',
      prepared: prepareMerge(baseContent, devContent, baseContent),
    });
    const pr = await createPullRequest(mockDB, {
      projectId: project.projectId,
      title: 'Merge dev',
      sourceBranch: 'dev',
      targetBranch: 'main',
      sourceCommitHash: source.hash,
      targetBaseCommitHash: oldMain,
      status: 'ready',
      authorId: 'human:test',
    });
    await updatePullRequest(mockDB, pr.pullRequestId, { mergeDraftId: draft.draftId });
    await replacePullRequestChecks(
      mockDB,
      pr.pullRequestId,
      Array.from({ length: 6 }, (_, index) => ({
        kind: 'review_requirement' as const,
        status: 'passed' as const,
        title: `Historical check ${index + 1}`,
      }))
    );
    const nextMainCandidate = structuredClone(t3xPrdP0Fixtures.validCandidateTree);
    nextMainCandidate.summary.audience = 'Main advanced';
    await createWorkspaceCommit({
      projectId: project.projectId,
      branch: 'main',
      workspaceId: 'historical-pr-next-main',
      candidate: nextMainCandidate,
    });
    const newMain = (await findBranchByName(mockDB, project.projectId, 'main'))!.headCommitHash!;

    const path = `/v1/projects/${project.projectId}/pull-requests/${pr.number}`;
    const detail = (await (await app.request(path)).json()) as ApiResponse;
    expect(detail.data).toMatchObject({
      status: 'ready',
      source_commit_id: source.hash,
      target_base_commit_id: oldMain,
      readiness_current: false,
    });
    expect(detail.data.checks).toHaveLength(6);
    const comparison = await app.request(`${path}/merge-review`);
    expect(comparison.status).toBe(409);
    expect(((await comparison.json()) as ApiResponse).error.code).toBe('PULL_REQUEST_HEAD_CHANGED');

    const merge = await app.request(`${path}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_source_commit_id: source.hash,
        expected_target_commit_id: oldMain,
        strategy: 'deterministic_merge',
      }),
    });
    expect(merge.status).toBe(409);
    expect(((await merge.json()) as ApiResponse).error.code).toBe('PULL_REQUEST_HEAD_CHANGED');

    const currentDraft = await createMergeDraft(mockDB, {
      projectId: project.projectId,
      sourceHash: source.hash,
      targetHash: newMain,
      sourceBranch: 'dev',
      targetBranch: 'main',
      prepared: prepareMerge(baseContent, devContent, {
        trees: yvalueToTrees({ prd: nextMainCandidate }),
        relations: [],
      }),
    });
    await updatePullRequest(mockDB, pr.pullRequestId, {
      targetBaseCommitHash: newMain,
      mergeDraftId: currentDraft.draftId,
      status: 'ready',
    });
    const migrationReview = await app.request(`${path}/merge-review`);
    expect(migrationReview.status).toBe(409);
    expect(((await migrationReview.json()) as ApiResponse).error).toMatchObject({
      code: 'SCHEMA_MIGRATION_REQUIRED',
      details: { branch: 'dev' },
    });
    const migrationMerge = await app.request(`${path}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_source_commit_id: source.hash,
        expected_target_commit_id: newMain,
        strategy: 'deterministic_merge',
      }),
    });
    expect(migrationMerge.status).toBe(409);
    expect(((await migrationMerge.json()) as ApiResponse).error.code).toBe(
      'SCHEMA_MIGRATION_REQUIRED'
    );

    const rerun = await app.request(`${path}/checks/rerun`, { method: 'POST' });
    expect(rerun.status).toBe(200);
    const rerunBody = (await rerun.json()) as ApiResponse;
    expect(rerunBody.data).toMatchObject({
      status: 'blocked',
      merge_draft_id: null,
      merge_commit_id: null,
      readiness_current: true,
      required_action: { kind: 'schema_migration', branch: 'dev' },
    });
    expect(rerunBody.data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'schema_compatibility',
          status: 'blocked',
          message: expect.stringMatching(/explicit migration/i),
        }),
      ])
    );
    expect(newMain).not.toBe(oldMain);
    expect((await findBranchByName(mockDB, project.projectId, 'main'))?.headCommitHash).toBe(
      newMain
    );

    await createWorkspaceCommit({
      projectId: project.projectId,
      branch: 'dev',
      workspaceId: 'historical-pr-migrated-dev',
      candidate: devCandidate,
    });
    const afterCommit = (await (await app.request(path)).json()) as ApiResponse;
    expect(afterCommit.data).toMatchObject({
      status: 'blocked',
      readiness_current: false,
      required_action: null,
    });
    const migrated = await app.request(`${path}/checks/rerun`, { method: 'POST' });
    expect(migrated.status).toBe(200);
    const migratedBody = (await migrated.json()) as ApiResponse;
    expect(migratedBody.data.required_action).toBeNull();
    expect(migratedBody.data.source_commit_id).not.toBe(source.hash);
    expect(migratedBody.data.checks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'schema_compatibility',
          status: 'blocked',
          message: expect.stringMatching(/explicit migration/i),
        }),
      ])
    );
  });
});
