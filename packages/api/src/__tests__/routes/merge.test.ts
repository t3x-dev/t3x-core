/** CommitV2 merge route integration tests. */

/** biome-ignore-all lint/suspicious/noExplicitAny: compact route response assertions */

import type { AnyDB } from '@t3x-dev/storage';
import {
  ensureMainBranch,
  getMergeDraft,
  getTransitionRefHead,
  getVerifiedTransitionCommitGraph,
  insertBranch,
  insertProject,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  commitRepositoryYOpsState,
  createRepositoryYOpsStateFromSemanticContent,
} from '../../lib/repository-state-transition';
import { setupTestDB, testData } from '../setup';

let mockDB: AnyDB;

vi.mock('../../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

const mockDispatch = vi.fn();
vi.mock('../../lib/webhook-dispatcher', () => ({
  webhookDispatcher: { dispatch: (...args: unknown[]) => mockDispatch(...args) },
}));

import { mergeRoutes } from '../../routes/merge.openapi';

const HUMAN = { kind: 'human' as const, id: 'user:merge-route-test' };
const app = new Hono();
app.route('/', mergeRoutes);

describe('CommitV2 merge routes', () => {
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => cleanup());

  beforeEach(async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'CommitV2 Merge Route' }));
    projectId = project.projectId;
    mockDispatch.mockClear();
  });

  async function fixture() {
    await ensureMainBranch(mockDB, projectId);
    const base = await commitRepositoryYOpsState({
      db: mockDB,
      projectId,
      refName: 'main',
      expectedHead: null,
      target: createRepositoryYOpsStateFromSemanticContent({
        trees: [{ key: 'shared', slots: { value: 'base' }, children: [] }],
        relations: [],
      }),
      actor: HUMAN,
      intent: 'Create merge base',
    });
    await insertBranch(mockDB, { projectId, name: 'feature', parentBranch: 'main' });
    const source = await commitRepositoryYOpsState({
      db: mockDB,
      projectId,
      refName: 'feature',
      expectedHead: base.commitDigest,
      target: createRepositoryYOpsStateFromSemanticContent({
        trees: [
          { key: 'shared', slots: { value: 'source' }, children: [] },
          { key: 'source_only', slots: { enabled: true }, children: [] },
        ],
        relations: [],
      }),
      actor: HUMAN,
      intent: 'Change feature',
    });
    const target = await commitRepositoryYOpsState({
      db: mockDB,
      projectId,
      refName: 'main',
      expectedHead: base.commitDigest,
      target: createRepositoryYOpsStateFromSemanticContent({
        trees: [
          { key: 'shared', slots: { value: 'target' }, children: [] },
          { key: 'target_only', slots: { enabled: true }, children: [] },
        ],
        relations: [],
      }),
      actor: HUMAN,
      intent: 'Change main',
    });
    return { base, source, target };
  }

  async function prepare(sourceHash: string, targetHash: string) {
    const response = await app.request('/v1/merge/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        source_hash: sourceHash,
        target_hash: targetHash,
      }),
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as any).data;
  }

  function decisions() {
    return {
      conflictResolutions: { shared: 'source' },
      keepFromSource: ['source_only'],
      keepFromTarget: ['target_only'],
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    };
  }

  async function postDraft(sourceHash: string, targetHash: string) {
    return app.request('/v1/merge/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        source_hash: sourceHash,
        target_hash: targetHash,
        source_branch: 'feature',
        target_branch: 'main',
      }),
    });
  }

  it('prepares only from verified CommitV2 graphs', async () => {
    const { source, target } = await fixture();

    const prepared = await prepare(source.commitDigest, target.commitDigest);

    expect(prepared.conflicts.map((conflict: any) => conflict.path)).toEqual(['shared']);
    expect(prepared.onlyInSource).toEqual(['source_only']);
    expect(prepared.onlyInTarget).toEqual(['target_only']);
  });

  it('executes a target-first two-parent CommitV2 and advances the target ref', async () => {
    const { source, target } = await fixture();
    const prepared = await prepare(source.commitDigest, target.commitDigest);

    const response = await app.request('/v1/merge/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        source_hash: source.commitDigest,
        target_hash: target.commitDigest,
        prepared,
        decisions: decisions(),
        message: 'Merge feature into main',
        branch: 'main',
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as any;
    expect(body.data).toMatchObject({
      schema: 't3x/commit/v2',
      parents: [target.commitDigest, source.commitDigest],
      branch: 'main',
    });
    await expect(
      getTransitionRefHead(mockDB, { projectId, refName: 'main' })
    ).resolves.toMatchObject({ head: body.data.hash });
    await expect(
      getVerifiedTransitionCommitGraph(mockDB, projectId, body.data.hash)
    ).resolves.toMatchObject({
      effect: { driver: { protocol: 't3x.dev/yops-semantic-merge' } },
    });
  });

  it('rejects a client preparation that hides a server-recomputed conflict', async () => {
    const { source, target } = await fixture();

    const response = await app.request('/v1/merge/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        source_hash: source.commitDigest,
        target_hash: target.commitDigest,
        prepared: {
          autoKept: [],
          conflicts: [],
          onlyInSource: [],
          onlyInTarget: [],
          relationsOnlyInSource: [],
          relationsOnlyInTarget: [],
          relationsInBoth: [],
        },
        decisions: { ...decisions(), conflictResolutions: {} },
        message: 'Tampered merge',
        branch: 'main',
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' },
    });
    await expect(
      getTransitionRefHead(mockDB, { projectId, refName: 'main' })
    ).resolves.toMatchObject({ head: target.commitDigest });
  });

  it('commits a merge draft and its ref update atomically through CommitV2', async () => {
    const { source, target } = await fixture();
    const draftResponse = await postDraft(source.commitDigest, target.commitDigest);
    expect(draftResponse.status).toBe(201);
    const draft = ((await draftResponse.json()) as any).data;

    const response = await app.request(`/v1/merge/drafts/${draft.draftId}/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Commit draft merge',
        branch: 'main',
        decisions: decisions(),
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as any;
    expect(body.data).toMatchObject({
      schema: 't3x/commit/v2',
      parents: [target.commitDigest, source.commitDigest],
    });
    expect((await getMergeDraft(mockDB, draft.draftId))?.status).toBe('committed');
    await expect(
      getTransitionRefHead(mockDB, { projectId, refName: 'main' })
    ).resolves.toMatchObject({ head: body.data.hash });
  });

  it('keeps a merge draft pending when the target ref moved', async () => {
    const { source, target } = await fixture();
    const draft = (
      (await (await postDraft(source.commitDigest, target.commitDigest)).json()) as any
    ).data;
    const moved = await commitRepositoryYOpsState({
      db: mockDB,
      projectId,
      refName: 'main',
      expectedHead: target.commitDigest,
      target: createRepositoryYOpsStateFromSemanticContent({
        trees: [{ key: 'moved', slots: { value: true }, children: [] }],
        relations: [],
      }),
      actor: HUMAN,
      intent: 'Move target',
    });

    const response = await app.request(`/v1/merge/drafts/${draft.draftId}/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Stale merge', decisions: decisions() }),
    });

    expect(response.status).toBe(409);
    expect((await getMergeDraft(mockDB, draft.draftId))?.status).toBe('pending');
    await expect(
      getTransitionRefHead(mockDB, { projectId, refName: 'main' })
    ).resolves.toMatchObject({ head: moved.commitDigest });
  });
});
