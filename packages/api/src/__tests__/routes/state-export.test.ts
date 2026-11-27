import { T3xApiError, T3xClient } from '@t3x-dev/api-client';
import { createYOpsState } from '@t3x-dev/core';
import { type AnyDB, ensureMainBranch, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { load } from 'js-yaml';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { commitRepositoryYOpsState } from '../../lib/repository-state-transition';
import { setupTestDB, testData } from '../setup';

let mockDB: AnyDB;
vi.mock('../../lib/db', () => ({ getDB: vi.fn(() => Promise.resolve(mockDB)) }));

import { commitRoutes } from '../../routes/commits.openapi';
import { diffRoutes } from '../../routes/diff.openapi';
import { stateOverviewRoutes } from '../../routes/state-overview.openapi';
import { statePresentationRoutes } from '../../routes/state-presentations.openapi';

const app = new Hono();
app.route('/', commitRoutes);
app.route('/', diffRoutes);
app.route('/', stateOverviewRoutes);
app.route('/', statePresentationRoutes);
let cleanup: () => Promise<void>;
let projectId: string;
let digest: string;
const value = { services: { app: { image: 'example:v1', ports: [8080] } } };

beforeAll(async () => {
  const setup = await setupTestDB();
  mockDB = setup.db;
  cleanup = setup.cleanup;
  const project = await insertProject(mockDB, testData.project({ name: 'State export' }));
  projectId = project.projectId;
  await ensureMainBranch(mockDB, projectId);
  const first = await commitRepositoryYOpsState({
    db: mockDB,
    projectId,
    refName: 'main',
    expectedHead: null,
    target: createYOpsState(value),
    actor: { kind: 'human', id: 'export-test' },
    intent: 'First revision',
  });
  digest = first.commitDigest;
  await commitRepositoryYOpsState({
    db: mockDB,
    projectId,
    refName: 'main',
    expectedHead: digest,
    target: createYOpsState({ changed: true }),
    actor: { kind: 'human', id: 'export-test' },
    intent: 'Advance HEAD',
  });
});
afterAll(async () => cleanup?.());

function request(format = 'json', project = projectId, hash = digest, extra = '') {
  return app.request(
    `/v1/commits/${encodeURIComponent(hash)}/export?project_id=${project}&format=${format}${extra}`
  );
}

it.each(['json', 'yaml'])('exports historical %s after HEAD has advanced', async (format) => {
  const response = await request(format);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const { data } = await response.json();
  expect(load(data.content)).toEqual(value);
  expect(data.sourceCommit.digest).toBe(digest);
  expect(data.content).not.toContain('changed');
});

it('does not resolve a commit from a different project', async () => {
  const other = await insertProject(mockDB, testData.project({ name: 'Other project' }));
  expect((await request('json', other.projectId)).status).toBe(404);
});

it('does not fall back to HEAD for missing objects or malformed digests', async () => {
  expect((await request('json', projectId, `sha256:${'f'.repeat(64)}`)).status).toBe(404);
  expect((await request('json', projectId, 'main')).status).toBe(400);
});

it('rejects a caller State mismatch and unsupported renderer format', async () => {
  expect(
    (await request('json', projectId, digest, `&state_digest=sha256:${'a'.repeat(64)}`)).status
  ).toBe(409);
  expect((await request('pdf')).status).toBe(400);
});

it('denies exports when authentication is enabled and no principal is provided', async () => {
  const previous = process.env.AUTH_DISABLED;
  process.env.AUTH_DISABLED = 'false';
  try {
    expect((await request()).status).toBe(403);
  } finally {
    if (previous === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = previous;
  }
});

it('reports insufficient historical evidence separately from a missing Commit', async () => {
  const base = `/v1/projects/${projectId}/commits`;
  const response = await app.request(`${base}/${encodeURIComponent(digest)}/schema-binding`);
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual({ commit_digest: digest, status: 'unknown' });
  const missing = await app.request(
    `${base}/${encodeURIComponent(`sha256:${'e'.repeat(64)}`)}/schema-binding`
  );
  expect(missing.status).toBe(404);
  expect((await missing.json()).error).toMatchObject({
    code: 'NOT_FOUND',
    details: { protocol_code: 'COMMIT_NOT_FOUND' },
  });
});

it('identifies the same absent digest through each project-scoped client read', async () => {
  const client = new T3xClient({
    baseUrl: 'http://localhost',
    fetch: async (input, init) => app.request(new Request(input, init)),
  });
  const missing = `sha256:${'e'.repeat(64)}`;
  const reads = [
    client.getCommit(projectId, missing),
    client.getStateOverview(projectId, missing),
    client.exportCommitState(projectId, missing, 'json'),
    client.getStatePresentation(projectId, missing),
    client.getCommittedSchemaBinding(projectId, missing),
    client.compareCommittedStates({
      project_id: projectId,
      base_commit_hash: digest,
      target_commit_hash: missing,
    }),
  ];
  for (const result of await Promise.allSettled(reads)) {
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      const error = result.reason;
      expect(error).toBeInstanceOf(T3xApiError);
      expect(error.status).toBe(404);
      expect(error.details?.protocol_code ?? error.code).toBe('COMMIT_NOT_FOUND');
    }
  }
});
