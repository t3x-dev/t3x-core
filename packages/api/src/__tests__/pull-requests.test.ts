import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { pullRequestRoutes } from '../routes/pull-requests.openapi';

// biome-ignore lint/suspicious/noExplicitAny: route contract smoke helper
type ApiResponse = any;

describe('Pull request routes', () => {
  const app = new Hono();
  app.route('/', pullRequestRoutes);

  it('lists active project pull requests with readiness counts', async () => {
    const res = await app.request('/v1/projects/proj_pr_test/pull-requests');
    expect(res.status).toBe(200);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.counts.active).toBe(3);
    expect(data.data.counts.merged).toBe(1);
    expect(data.data.pull_requests[0].source_branch).toBe('release-notes/cleanup');
  });

  it('moves a newly created pull request through readiness and merge', async () => {
    const projectId = 'proj_pr_create_flow';
    const res = await app.request(`/v1/projects/${projectId}/pull-requests`, {
      body: JSON.stringify({
        description: 'Refresh output bundle',
        source_branch: 'outputs/bundle-refresh',
        target_branch: 'main',
        title: 'Output bundle refresh',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    expect(res.status).toBe(201);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('open');
    expect(data.data.source_commit_id).toBe('sha:31af8d2');
    expect(data.data.target_base_commit_id).toBe('sha:6de18a0');
    expect(
      data.data.checks.some((check: { kind: string }) => check.kind === 'merge_simulation')
    ).toBe(true);

    const duplicate = await app.request(`/v1/projects/${projectId}/pull-requests`, {
      body: JSON.stringify({
        description: 'Duplicate output bundle PR',
        source_branch: 'outputs/bundle-refresh',
        target_branch: 'main',
        title: 'Duplicate output bundle refresh',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(duplicate.status).toBe(409);
    expect(((await duplicate.json()) as ApiResponse).error.code).toBe(
      'PULL_REQUEST_ALREADY_EXISTS'
    );

    const rerun = await app.request(
      `/v1/projects/${projectId}/pull-requests/${data.data.number}/checks/rerun`,
      { method: 'POST' }
    );
    expect(rerun.status).toBe(200);
    const rerunData: ApiResponse = await rerun.json();
    expect(rerunData.data.status).toBe('ready');
    expect(
      rerunData.data.checks.find((check: { kind: string }) => check.kind === 'merge_simulation')
        .status
    ).toBe('passed');

    const merge = await app.request(
      `/v1/projects/${projectId}/pull-requests/${data.data.number}/merge`,
      {
        body: JSON.stringify({ strategy: 'deterministic_merge' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }
    );
    expect(merge.status).toBe(200);
    expect(((await merge.json()) as ApiResponse).data.status).toBe('merged');
  });

  it('lists branches that can open a new pull request', async () => {
    const res = await app.request('/v1/projects/proj_pr_compare/pull-requests/compare?base=main');
    expect(res.status).toBe(200);

    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.base_branches).toContain('main');
    expect(
      data.data.compare_branches.some(
        (candidate: { branch: string; status: string }) =>
          candidate.branch === 'outputs/bundle-refresh' && candidate.status === 'ready'
      )
    ).toBe(true);
    expect(
      data.data.compare_branches.some(
        (candidate: { branch: string; status: string }) =>
          candidate.branch === 'workspace/audience-handoff' && candidate.status === 'already_open'
      )
    ).toBe(true);
  });

  it('returns checks, activity, and structured diff data for PR details', async () => {
    const res = await app.request('/v1/projects/proj_pr_detail/pull-requests/17');
    expect(res.status).toBe(200);

    const data: ApiResponse = await res.json();
    expect(data.data.diff_summary).toEqual({
      changed_nodes: 5,
      output_impacts: 2,
      source_refs: 3,
      yops_operations: 7,
    });
    expect(data.data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'merge_simulation', status: 'passed' }),
      ])
    );
    expect(data.data.activity).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'created' })])
    );
  });

  it('blocks merge until the pull request is ready', async () => {
    const res = await app.request('/v1/projects/proj_pr_test/pull-requests/18/merge', {
      body: JSON.stringify({ strategy: 'deterministic_merge' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    expect(res.status).toBe(409);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('PULL_REQUEST_NOT_READY');
  });

  it('marks a ready pull request as merged', async () => {
    const res = await app.request('/v1/projects/proj_pr_ready_merge/pull-requests/17/merge', {
      body: JSON.stringify({ strategy: 'deterministic_merge' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('merged');
    expect(data.data.merged_at).toBeTruthy();
  });

  it('closes an active pull request without merging it', async () => {
    const res = await app.request('/v1/projects/proj_pr_close/pull-requests/18/close', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('closed');
    expect(data.data.closed_at).toBeTruthy();
    expect(data.data.merged_at).toBeNull();
  });
});
