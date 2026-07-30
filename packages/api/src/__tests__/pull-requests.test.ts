/** biome-ignore-all lint/suspicious/noExplicitAny: compact API contract assertions */

import type { AnyDB } from '@t3x-dev/storage';
import {
  createCommit,
  findBranchByName,
  getCommit,
  getMergeDraft,
  insertBranch,
  insertProject,
  listCommits,
  updateBranchHead,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

type ApiResponse = any;

let mockDB: AnyDB;
let mockSql: Awaited<ReturnType<typeof setupTestDB>>['sql'];

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { pullRequestRoutes } from '../routes/pull-requests.openapi';

describe('Pull request routes', () => {
  const app = new Hono();
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

  async function createBranchFixture(options: { conflict?: boolean } = {}) {
    const project = await insertProject(mockDB, testData.project({ name: 'PR route test' }));
    await insertBranch(mockDB, { projectId: project.projectId, name: 'main' });
    const target = await createCommit(mockDB, {
      parents: [],
      author: { type: 'human', name: 'Test User' },
      content: {
        trees: [{ key: 'product', slots: { version: 1 }, children: [] }],
        relations: [],
      },
      project_id: project.projectId,
      message: 'main baseline',
      branch: 'main',
      enforceBranchLinearity: true,
    });

    await insertBranch(mockDB, {
      projectId: project.projectId,
      name: 'feature/pr-flow',
      parentBranch: 'main',
      description: 'Feature PR flow',
    });
    const source = await createCommit(mockDB, {
      parents: [target.hash],
      author: { type: 'human', name: 'Test User' },
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
      project_id: project.projectId,
      message: 'feature update',
      branch: 'feature/pr-flow',
      sources: [{ type: 'import', id: 'spec_1' }],
      enforceBranchLinearity: true,
    });
    const targetHead = options.conflict
      ? await createCommit(mockDB, {
          parents: [target.hash],
          author: { type: 'human', name: 'Target User' },
          content: {
            trees: [{ key: 'product', slots: { version: 3 }, children: [] }],
            relations: [],
          },
          project_id: project.projectId,
          message: 'conflicting main update',
          branch: 'main',
          enforceBranchLinearity: true,
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

  it('repairs a legacy main branch before listing pull request comparisons', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Legacy PR project' }));
    const target = await createCommit(mockDB, {
      parents: [],
      author: { type: 'human', name: 'Legacy User' },
      content: {
        trees: [{ key: 'product', slots: { version: 1 }, children: [] }],
        relations: [],
      },
      project_id: project.projectId,
      message: 'legacy main baseline',
      branch: 'main',
    });
    await insertBranch(mockDB, {
      projectId: project.projectId,
      name: 'feature/pr-flow',
      parentBranch: 'main',
    });
    await createCommit(mockDB, {
      parents: [target.hash],
      author: { type: 'human', name: 'Legacy User' },
      content: {
        trees: [
          { key: 'product', slots: { version: 1 }, children: [] },
          { key: 'release', slots: { ready: true }, children: [] },
        ],
        relations: [],
      },
      project_id: project.projectId,
      message: 'legacy feature update',
      branch: 'feature/pr-flow',
      enforceBranchLinearity: true,
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
    const target = await createCommit(mockDB, {
      parents: [fixture.source.hash],
      author: { type: 'human', name: 'Fast-forward User' },
      content: {
        trees: [
          { key: 'product', slots: { version: 1 }, children: [] },
          { key: 'release', slots: { ready: true, reviewed: true }, children: [] },
        ],
        relations: [],
      },
      project_id: fixture.projectId,
      message: 'main contains feature',
      branch: 'main',
    });
    await updateBranchHead(mockDB, fixture.projectId, 'main', target.hash);

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
    const target = await createCommit(mockDB, {
      parents: [],
      author: { type: 'human', name: 'Relation User' },
      content: { trees, relations: [] },
      project_id: project.projectId,
      message: 'relation baseline',
      branch: 'main',
      enforceBranchLinearity: true,
    });
    await insertBranch(mockDB, {
      projectId: project.projectId,
      name: 'feature/pr-flow',
      parentBranch: 'main',
    });
    const source = await createCommit(mockDB, {
      parents: [target.hash],
      author: { type: 'human', name: 'Relation User' },
      content: {
        trees,
        relations: [{ from: 'release', to: 'product', type: 'depends' }],
      },
      project_id: project.projectId,
      message: 'add relation',
      branch: 'feature/pr-flow',
      enforceBranchLinearity: true,
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
    const source = await createCommit(mockDB, {
      parents: [],
      author: { type: 'human', name: 'Feature User' },
      content: {
        trees: [{ key: 'product', slots: { version: 1 }, children: [] }],
        relations: [],
      },
      project_id: project.projectId,
      message: 'first feature commit',
      branch: 'feature/first-commit',
      enforceBranchLinearity: true,
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
      status: 'open',
    });
    expect(data.data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'source_commit', status: 'passed' }),
        expect.objectContaining({ kind: 'merge_simulation', status: 'pending' }),
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
    await createCommit(mockDB, {
      parents: [fixture.source.hash],
      author: { type: 'human', name: 'Concurrent User' },
      content: {
        trees: [
          { key: 'product', slots: { version: 1 }, children: [] },
          { key: 'release', slots: { ready: true, amended: true }, children: [] },
        ],
        relations: [],
      },
      project_id: fixture.projectId,
      message: 'source moved after preview',
      branch: 'feature/pr-flow',
      enforceBranchLinearity: true,
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
    const mergeCommit = await getCommit(mockDB, merged.data.merge_commit_id);
    expect(mergeCommit?.parents).toEqual([fixture.target.hash, fixture.source.hash]);
    expect(mergeCommit?.content.trees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'product', slots: { version: 2 } }),
        expect.objectContaining({ key: 'release', slots: { ready: true } }),
      ])
    );
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
    expect(await listCommits(mockDB, { projectId: fixture.projectId })).toHaveLength(3);
  });

  it('records preparation failures as blocked instead of leaving a PR checking', async () => {
    const fixture = await createBranchFixture();
    const opened = await openPullRequest(fixture.projectId);
    const number = opened.data.data.number;
    const firstRerun = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${number}/checks/rerun`,
      { method: 'POST' }
    );
    const prepared = (await firstRerun.json()) as ApiResponse;
    await mockSql.unsafe('UPDATE merge_drafts SET prepared_json = $1 WHERE draft_id = $2', [
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
    const movedTarget = await createCommit(mockDB, {
      parents: [fixture.target.hash],
      author: { type: 'human', name: 'Concurrent User' },
      content: {
        trees: [{ key: 'product', slots: { version: 1, patch: true }, children: [] }],
        relations: [],
      },
      project_id: fixture.projectId,
      message: 'target moved',
      branch: 'main',
      enforceBranchLinearity: true,
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

    const mergeCommit = await getCommit(mockDB, merged.data.merge_commit_id);
    expect(mergeCommit?.parents).toEqual([fixture.target.hash, fixture.source.hash]);
    expect(mergeCommit?.branch).toBe('main');
    expect((await findBranchByName(mockDB, fixture.projectId, 'main'))?.headCommitHash).toBe(
      mergeCommit?.hash
    );
    expect(
      (await findBranchByName(mockDB, fixture.projectId, 'feature/pr-flow'))?.headCommitHash
    ).toBe(fixture.source.hash);
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
    expect(await listCommits(mockDB, { projectId: fixture.projectId })).toHaveLength(3);

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
    const movedSource = await createCommit(mockDB, {
      parents: [fixture.source.hash],
      author: { type: 'human', name: 'Concurrent User' },
      content: {
        trees: [
          { key: 'product', slots: { version: 1 }, children: [] },
          { key: 'release', slots: { ready: true, amended: true }, children: [] },
        ],
        relations: [],
      },
      project_id: fixture.projectId,
      message: 'source moved',
      branch: 'feature/pr-flow',
      enforceBranchLinearity: true,
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
});
