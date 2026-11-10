import { randomUUID } from 'node:crypto';
import { createYOpsState } from '@t3x-dev/core';
import {
  type AnyDB,
  ensureMainBranch,
  findProjectById,
  insertProject,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { sha256CompositionValue } from '@t3x-dev/yschema';
import { Hono } from 'hono';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { projectGrants } from '../../../../storage/src/schema-trees';
import { commitRepositoryYOpsState } from '../../lib/repository-state-transition';
import { setupTestDB, testData } from '../setup';

const control = vi.hoisted(() => ({
  fail: false,
  schema: null as null | {
    status: 'bound';
    schemaHash: string;
    definition: Record<string, unknown>;
    bindings: Record<string, unknown>[];
  },
}));
vi.mock('@t3x-dev/application', async (original) => {
  const actual = await original<typeof import('@t3x-dev/application')>();
  return {
    ...actual,
    exportCommittedState: (...args: Parameters<typeof actual.exportCommittedState>) => {
      if (control.fail) throw new Error('Private adapter failure');
      return actual.exportCommittedState(...args);
    },
  };
});
vi.mock('../../lib/workspace-schema-review', async (original) => {
  const actual = await original<typeof import('../../lib/workspace-schema-review')>();
  return {
    ...actual,
    committedWorkspaceSchemaAtHead: vi.fn(async () =>
      control.schema ? structuredClone(control.schema) : actual.unboundWorkspaceSchema()
    ),
  };
});
let mockDB: AnyDB;
vi.mock('../../lib/db', () => ({ getDB: vi.fn(() => Promise.resolve(mockDB)) }));

import { workspaceDeliveryRoutes } from '../../routes/workspace-deliveries.openapi';

const app = new Hono();
app.route('/', workspaceDeliveryRoutes);
let cleanup: () => Promise<void>;
let projectId: string;
let digest: string;
let revision: number;
const workspaceId = 'delivery-test';
const workspace = () => ({
  lastCommitHash: digest,
  outputTargets: [
    { id: 'legacy', type: 'document', format: 'markdown' },
    { id: 'json', type: 'export', format: 'json' },
  ],
});
beforeAll(async () => {
  const setup = await setupTestDB();
  mockDB = setup.db;
  cleanup = setup.cleanup;
  projectId = (
    await insertProject(mockDB, {
      ...testData.project({ name: 'Delivery' }),
      namespaceId: 'ns_t3x_dev',
    })
  ).projectId;
  await ensureMainBranch(mockDB, projectId);
  const definition = { yschema: '0.1', name: 'Delivery', nodes: {} };
  control.schema = {
    status: 'bound',
    schemaHash: await sha256CompositionValue(definition),
    definition,
    bindings: [{ canonicalName: 'team/delivery', version: '1.0.0' }],
  };
  digest = (
    await commitRepositoryYOpsState({
      db: mockDB,
      projectId,
      refName: 'main',
      expectedHead: null,
      target: createYOpsState({ service: 'app:v1' }),
      actor: { kind: 'human', id: 'delivery-test' },
      intent: 'Delivery source',
    })
  ).commitDigest;
  revision = (
    await upsertWorkspaceDraft(mockDB, {
      project_id: projectId,
      workspace_id: workspaceId,
      title: 'Delivery',
      workspace_state: workspace(),
    })
  ).revision;
});
afterAll(async () => cleanup?.());
const url = (project = projectId) => `/v1/projects/${project}/workspaces/${workspaceId}/deliveries`;
const input = (extra = {}) => ({
  targetId: 't3x:committed-state',
  format: 'yaml',
  commitDigest: digest,
  workspaceRevision: revision,
  idempotencyKey: randomUUID(),
  ...extra,
});
const post = (body: ReturnType<typeof input>, project = projectId) =>
  app.request(url(project), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const deploymentUrl = () => `/v1/projects/${projectId}/workspaces/${workspaceId}/deployments`;
const postDeployment = (body: Record<string, unknown>) =>
  app.request(deploymentUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
it('lists targets without execution or receipts and labels legacy targets', async () => {
  const response = await app.request(url());
  const { data } = await response.json();
  expect(response.status).toBe(200);
  expect(data.receipts).toEqual([]);
  expect(data.targets.map((t: { mode: string }) => t.mode)).toEqual([
    'download',
    'download',
    'legacy',
    'download',
  ]);
});
it('prepares deterministic committed State and Schema as one portable artifact', async () => {
  const first = await (
    await post(input({ targetId: 't3x:portable-artifact', format: 'bundle' }))
  ).json();
  const second = await (
    await post(input({ targetId: 't3x:portable-artifact', format: 'bundle' }))
  ).json();
  expect(first.data.receipt).toMatchObject({
    adapter: 't3x.portable/v1',
    format: 'bundle',
    status: 'prepared',
  });
  expect(first.data.artifact).toMatchObject({
    format: 'bundle',
    sourceCommit: { digest },
    schemaDigest: control.schema?.schemaHash,
  });
  expect(second.data.artifact.byteDigest).toBe(first.data.artifact.byteDigest);
  expect(second.data.artifact.content).toBe(first.data.artifact.content);
});
it('fails closed when the exact committed Schema cannot be verified', async () => {
  const schema = control.schema;
  control.schema = null;
  try {
    const result = await (
      await post(input({ targetId: 't3x:portable-artifact', format: 'bundle' }))
    ).json();
    expect(result.data.artifact).toBeNull();
    expect(result.data.receipt).toMatchObject({
      adapter: 't3x.portable/v1',
      status: 'failed',
      errorCode: 'ARTIFACT_PREPARATION_FAILED',
    });
  } finally {
    control.schema = schema;
  }
});
it('concurrent duplicate requests produce one exact artifact receipt', async () => {
  const body = input();
  const responses = await Promise.all([post(body), post(body)]);
  expect(responses.map((r) => r.status)).toEqual([200, 200]);
  const [a, b] = await Promise.all(responses.map((r) => r.json()));
  expect(a.data.receipt.id).toBe(b.data.receipt.id);
  expect(a.data.receipt.artifactDigest).toBe(a.data.artifact.byteDigest);
  expect(a.data.artifact.sourceCommit.digest).toBe(digest);
  expect(a.data.artifact.content).toContain('app:v1');
  expect(a.data.receipt.status).toBe('prepared');
  expect((await post({ ...body, format: 'json' })).status).toBe(409);
});
it('rejects legacy targets, format changes, forged revisions and unsupported adapters', async () => {
  expect((await post(input({ targetId: 'legacy' }))).status).toBe(422);
  expect((await post(input({ targetId: 'json' }))).status).toBe(409);
  expect((await post(input({ format: 'bundle' }))).status).toBe(409);
  expect((await post(input({ workspaceRevision: revision + 1 }))).status).toBe(409);
  expect((await post(input({ adapter: 'deploy' }))).status).toBe(400);
});
it('replays a receipt after workspace advances, but rejects a new stale request', async () => {
  const body = input();
  const first = await (await post(body)).json();
  revision = (
    await upsertWorkspaceDraft(
      mockDB,
      {
        project_id: projectId,
        workspace_id: workspaceId,
        title: 'Changed',
        workspace_state: workspace(),
      },
      revision
    )
  ).revision;
  const replay = await (await post(body)).json();
  expect(replay.data.receipt.id).toBe(first.data.receipt.id);
  expect((await post({ ...body, idempotencyKey: randomUUID() })).status).toBe(409);
});
it('persists sanitized failure and retries explicitly with linked attempts', async () => {
  const body = input();
  control.fail = true;
  let failed: Awaited<ReturnType<Response['json']>>;
  try {
    failed = await (await post(body)).json();
  } finally {
    control.fail = false;
  }
  expect(failed.data.artifact).toBeNull();
  expect(failed.data.receipt.status).toBe('failed');
  expect(JSON.stringify(failed)).not.toContain('Private adapter failure');
  expect((await (await post(body)).json()).data.receipt.status).toBe('failed');
  const retry = await (await post(input({ retryOf: failed.data.receipt.id }))).json();
  expect(retry.data.receipt).toMatchObject({
    status: 'prepared',
    attempt: 2,
    retryOf: failed.data.receipt.id,
  });
});
it('deploys only prepared portable artifacts and rolls back by fixed digest', async () => {
  const firstReceipt = (
    await (await post(input({ targetId: 't3x:portable-artifact', format: 'bundle' }))).json()
  ).data.receipt;
  const firstKey = randomUUID();
  const first = await (
    await postDeployment({
      deliveryId: firstReceipt.id,
      environment: 'preview',
      idempotencyKey: firstKey,
    })
  ).json();
  const replay = await (
    await postDeployment({
      deliveryId: firstReceipt.id,
      environment: 'preview',
      idempotencyKey: firstKey,
    })
  ).json();
  expect(replay.data.deployment.id).toBe(first.data.deployment.id);
  expect(first.data.deployment).toMatchObject({
    kind: 'deploy',
    adapter: 't3x.fixed-slot/v1',
    desiredArtifactDigest: firstReceipt.artifactDigest,
    actualArtifactDigest: firstReceipt.artifactDigest,
  });

  digest = (
    await commitRepositoryYOpsState({
      db: mockDB,
      projectId,
      refName: 'main',
      expectedHead: digest,
      target: createYOpsState({ service: 'app:v2' }),
      actor: { kind: 'human', id: 'delivery-test' },
      intent: 'Second delivery source',
    })
  ).commitDigest;
  revision = (
    await upsertWorkspaceDraft(
      mockDB,
      {
        project_id: projectId,
        workspace_id: workspaceId,
        title: 'Delivery v2',
        workspace_state: workspace(),
      },
      revision
    )
  ).revision;
  const secondReceipt = (
    await (await post(input({ targetId: 't3x:portable-artifact', format: 'bundle' }))).json()
  ).data.receipt;
  const second = await (
    await postDeployment({
      deliveryId: secondReceipt.id,
      environment: 'preview',
      idempotencyKey: randomUUID(),
    })
  ).json();
  expect(second.data.deployment.previousArtifactDigest).toBe(firstReceipt.artifactDigest);

  const rollback = await (
    await app.request(`${deploymentUrl()}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deploymentId: first.data.deployment.id,
        idempotencyKey: randomUUID(),
      }),
    })
  ).json();
  expect(rollback.data.deployment).toMatchObject({
    kind: 'rollback',
    previousArtifactDigest: secondReceipt.artifactDigest,
    actualArtifactDigest: firstReceipt.artifactDigest,
  });
  const listing = await (await app.request(url())).json();
  expect(listing.data.currentDeployment.id).toBe(rollback.data.deployment.id);
});
it('does not cross project or unauthenticated boundaries', async () => {
  const other = (await insertProject(mockDB, testData.project({ name: 'Other' }))).projectId;
  expect((await post(input(), other)).status).toBe(404);
  const previous = process.env.AUTH_DISABLED;
  process.env.AUTH_DISABLED = 'false';
  try {
    expect((await post(input())).status).toBe(403);
    expect((await app.request(url())).status).toBe(403);
  } finally {
    if (previous === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = previous;
  }
});

it('permits a viewer to read history but requires edit authority to record a delivery', async () => {
  const project = await findProjectById(mockDB, projectId);
  await mockDB.insert(projectGrants).values({
    grantId: 'delivery-viewer',
    projectId,
    namespaceId: project!.namespaceId!,
    principalKind: 'human',
    principalId: 'delivery-viewer',
    role: 'viewer',
    status: 'active',
  });
  const viewer = new Hono();
  viewer.use('*', async (c, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: authentication middleware fixture
    (c as any).set('apiKey', {
      id: 'viewer-key',
      user_id: 'delivery-viewer',
      principal_kind: 'human',
      project_id: null,
    });
    await next();
  });
  viewer.route('/', workspaceDeliveryRoutes);
  const previous = process.env.AUTH_DISABLED;
  process.env.AUTH_DISABLED = 'false';
  try {
    expect((await viewer.request(url())).status).toBe(200);
    expect(
      (
        await viewer.request(url(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input()),
        })
      ).status
    ).toBe(403);
  } finally {
    if (previous === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = previous;
  }
});
