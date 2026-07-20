/** biome-ignore-all lint/suspicious/noExplicitAny: compact API contract assertions */

import type { AnyDB } from '@t3x-dev/storage';
import {
  createCommit,
  findBranchByName,
  getCommit,
  insertBranch,
  insertProject,
  updateBranchHead,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

type ApiResponse = any;

let mockDB: AnyDB;

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
    });
    await updateBranchHead(mockDB, project.projectId, 'main', target.hash);

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
    });
    await updateBranchHead(mockDB, project.projectId, 'feature/pr-flow', source.hash);
    return { projectId: project.projectId, source, target };
  }

  async function openPullRequest(projectId: string) {
    const response = await app.request(`/v1/projects/${projectId}/pull-requests`, {
      body: JSON.stringify({
        description: 'Review the feature branch',
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

  it('returns an empty comparison set when the base branch has no commits yet', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Empty PR project' }));
    await insertBranch(mockDB, { projectId: project.projectId, name: 'main' });

    const response = await app.request(
      `/v1/projects/${project.projectId}/pull-requests/compare?base=main`
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as ApiResponse).data).toEqual({
      base_branches: [],
      compare_branches: [],
    });
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

  it('blocks readiness when the target branch moved after PR creation', async () => {
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
    });
    await updateBranchHead(mockDB, fixture.projectId, 'main', movedTarget.hash);

    const rerun = await app.request(
      `/v1/projects/${fixture.projectId}/pull-requests/${opened.data.data.number}/checks/rerun`,
      { method: 'POST' }
    );
    expect(rerun.status).toBe(200);
    const readiness = (await rerun.json()) as ApiResponse;
    expect(readiness.data.status).toBe('blocked');
    expect(readiness.data.merge_draft_id).toBeNull();
    expect(readiness.data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'base_freshness', status: 'blocked' }),
      ])
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
    expect(((await response.json()) as ApiResponse).error.code).toBe('PULL_REQUEST_HEAD_CHANGED');
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
