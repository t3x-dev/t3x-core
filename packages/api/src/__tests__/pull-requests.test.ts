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

  it('creates a pull request and queues merge readiness', async () => {
    const res = await app.request('/v1/projects/proj_pr_test/pull-requests', {
      body: JSON.stringify({
        description: 'Open handoff proposal',
        source_branch: 'workspace/audience-handoff',
        target_branch: 'main',
        title: 'Audience handoff updates',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    expect(res.status).toBe(201);
    const data: ApiResponse = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('open');
    expect(
      data.data.checks.some((check: { kind: string }) => check.kind === 'merge_simulation')
    ).toBe(true);
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
});
