import { createYOpsState } from '@t3x-dev/core';
import { type AnyDB, ensureMainBranch, insertProject, updateRun } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { dispatchRunnerRun } from '../lib/dispatch-runner-run';
import { commitRepositoryYOpsState } from '../lib/repository-state-transition';
import { configuredRunsRoutes } from '../routes/configured-runs.openapi';
import { setupTestDB } from './setup';

let db: AnyDB;
vi.mock('../lib/db', () => ({ getDB: () => Promise.resolve(db) }));
vi.mock('../lib/dispatch-runner-run', () => ({ dispatchRunnerRun: vi.fn() }));
let cleanup: () => Promise<void>;
let projectId: string;
let digest: string;
const app = new Hono();
app.use('*', async (c, next) => {
  c.set('apiKey', {
    id: 'test-key',
    user_id: 'run-owner',
    principal_kind: 'human',
    project_id: null,
  });
  await next();
});
app.route('/', configuredRunsRoutes);
beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
  ({ projectId } = await insertProject(db, { name: 'Run-Recovery', ownerId: 'run-owner' }));
  await ensureMainBranch(db, projectId);
  const commit = await commitRepositoryYOpsState({
    db,
    projectId,
    refName: 'main',
    expectedHead: null,
    target: createYOpsState({ test: true }),
    actor: { kind: 'human', id: 'run-owner' },
    intent: 'Run recovery',
  });
  digest = commit.commitDigest;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await cleanup?.();
});

async function trigger(requestId: string) {
  const res = await app.request(`/v1/projects/${projectId}/repository-runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id: requestId, commit_digest: digest }),
  });
  return { status: res.status, body: await res.json() };
}

it('recovers an ambiguous dispatch after configuration removal without sending again', async () => {
  vi.stubEnv('T3X_REPOSITORY_RUN_WEBHOOKS', JSON.stringify({ [projectId]: 'v1' }));
  vi.mocked(dispatchRunnerRun).mockRejectedValueOnce(new Error('lost response'));
  const first = await trigger('recover');
  expect(first.status).toBe(200);
  expect(first.body.data.status).toBe('queued');
  vi.stubEnv('T3X_REPOSITORY_RUN_WEBHOOKS', '{}');
  expect(await trigger('recover')).toEqual(first);
  expect((await trigger('new-request')).status).toBe(503);
  expect(dispatchRunnerRun).toHaveBeenCalledTimes(1);
});

it('preserves a terminal callback received before the dispatch acknowledgement', async () => {
  vi.stubEnv('T3X_REPOSITORY_RUN_WEBHOOKS', JSON.stringify({ [projectId]: 'v2' }));
  vi.mocked(dispatchRunnerRun).mockImplementationOnce(async ({ run_id }) => {
    const id = String(run_id);
    await updateRun(db, id, { status: 'failed', result_json: '{"fixture":true}' });
    return Response.json({ success: true, data: { runner_run_id: 'runner_' + id } });
  });
  expect((await trigger('early')).body.data.status).toBe('failed');
});
