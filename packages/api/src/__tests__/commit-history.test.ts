import type { AnyDB } from '@t3x-dev/storage';
import { branches, ensureMainBranch, insertProject } from '@t3x-dev/storage';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  commitRepositoryYOpsState,
  createRepositoryYOpsStateFromSemanticContent,
} from '../lib/repository-state-transition';
import { commitRoutes } from '../routes/commits.openapi';
import { setupTestDB, testData } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

const ACTOR = { kind: 'human' as const, id: 'user:commit-history-test' };

describe('CommitV2 read routes', () => {
  const app = new Hono();
  app.route('/', commitRoutes);
  let cleanup: () => Promise<void>;
  let projectId: string;
  let rootDigest: string;
  let childDigest: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(mockDB, testData.project({ name: 'CommitV2 History API' }));
    projectId = project.projectId;
    await ensureMainBranch(mockDB, projectId);
    const root = await commitRepositoryYOpsState({
      db: mockDB,
      projectId,
      refName: 'main',
      expectedHead: null,
      target: createRepositoryYOpsStateFromSemanticContent({
        trees: [{ key: 'root', slots: {}, children: [] }],
        relations: [],
      }),
      actor: ACTOR,
      intent: 'Create root',
    });
    rootDigest = root.commitDigest;
    const child = await commitRepositoryYOpsState({
      db: mockDB,
      projectId,
      refName: 'main',
      expectedHead: rootDigest,
      target: createRepositoryYOpsStateFromSemanticContent({
        trees: [{ key: 'child', slots: {}, children: [] }],
        relations: [],
      }),
      actor: ACTOR,
      intent: 'Create child',
    });
    childDigest = child.commitDigest;
  });

  afterAll(async () => cleanup());

  it('returns only CommitV2 history projections', async () => {
    const response = await app.request(`/v1/projects/${projectId}/commit-history`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { history: Array<{ id: string; format: string; schema: string }> };
    };
    expect(body.data.history.map((entry) => entry.id)).toEqual([childDigest, rootDigest]);
    expect(body.data.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ format: 'transition_v2', schema: 't3x/commit/v2' }),
      ])
    );
  });

  it('returns a stable non-retryable conflict when a ref head is unverifiable', async () => {
    const corruptProject = await insertProject(
      mockDB,
      testData.project({ name: 'CommitV2 Invalid Ref Head API' })
    );
    await ensureMainBranch(mockDB, corruptProject.projectId);
    const invalidHead = `sha256:${'f'.repeat(64)}`;
    await mockDB
      .update(branches)
      .set({ headCommitHash: invalidHead })
      .where(and(eq(branches.projectId, corruptProject.projectId), eq(branches.name, 'main')));

    const response = await app.request(
      `/v1/projects/${corruptProject.projectId}/commits?branch=main`
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: {
        code: 'REF_HEAD_INTEGRITY_INVALID',
        message: `Ref main in project ${corruptProject.projectId} points to an unverifiable commit ${invalidHead}`,
        details: {
          project_id: corruptProject.projectId,
          ref: 'main',
          head: invalidHead,
        },
      },
    });
  });

  it('resolves one verified CommitV2 object with explicit project membership', async () => {
    const response = await app.request(
      `/v1/commits/${encodeURIComponent(childDigest)}?project_id=${projectId}`
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        commit: {
          digest: childDigest,
          object: { schema: 't3x/commit/v2', parents: [{ digest: rootDigest }] },
        },
      },
    });
  });

  it('walks only CommitV2 parents and reports truncation accurately', async () => {
    const truncated = await app.request(
      `/v1/commits/${encodeURIComponent(childDigest)}/history?project_id=${projectId}&limit=1`
    );
    expect(truncated.status).toBe(200);
    expect(await truncated.json()).toMatchObject({
      data: { commits: [{ id: childDigest }], truncated: true },
    });

    const complete = await app.request(
      `/v1/commits/${encodeURIComponent(childDigest)}/history?project_id=${projectId}&limit=2`
    );
    expect(complete.status).toBe(200);
    expect(await complete.json()).toMatchObject({
      data: { commits: [{ id: childDigest }, { id: rootDigest }], truncated: false },
    });
  });

  it('returns the verified shared Transition view', async () => {
    const response = await app.request(
      `/v1/projects/${projectId}/commits/${encodeURIComponent(childDigest)}/transition-view?ref=main`
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        transition: {
          schema: 't3x.dev/transition-view/v1',
          mode: 'transition',
          history: { commit: { id: childDigest, format: 'transition_v2' } },
        },
      },
    });
  });

  it('returns Transition-owned YOps provenance and removes amend routes', async () => {
    const operations = await app.request(
      `/v1/commits/${encodeURIComponent(childDigest)}/operations?project_id=${projectId}`
    );
    expect(operations.status).toBe(200);
    expect(await operations.json()).toMatchObject({
      data: { commit_digest: childDigest, operations: [] },
    });

    expect(
      (
        await app.request(`/v1/commits/${encodeURIComponent(childDigest)}/message`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: 'mutate history' }),
        })
      ).status
    ).toBe(404);
  });
});
