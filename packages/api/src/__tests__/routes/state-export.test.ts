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

const app = new Hono();
app.route('/', commitRoutes);
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
