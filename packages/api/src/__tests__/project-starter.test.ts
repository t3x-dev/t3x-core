import type { ApiKey } from '@t3x-dev/core';
import {
  type AnyDB,
  getTransitionRefHead,
  getVerifiedTransitionCommitGraph,
  insertPersonalNamespace,
  projects,
  users,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ProjectLifecyclePolicyDeniedError } from '../lib/project-lifecycle-policy';
import { createPrdStarterContent } from '../lib/project-starter';
import { decodeRepositorySemanticContentState } from '../lib/repository-state-transition';
import { projectRoutes } from '../routes/projects.openapi';
import { setupTestDB } from './setup';

let mockDB: AnyDB;
vi.mock('../lib/db', () => ({ getDB: async () => mockDB }));

describe('private no-AI PRD starter', () => {
  let cleanup: () => Promise<void>;
  const originalAuth = process.env.AUTH_DISABLED;
  const owner = 'user_prd_starter';

  function appFor(userId = owner, denyCapacity = false, kind: 'human' | 'agent' = 'human') {
    const app = new Hono();
    app.use('*', async (c, next) => {
      const apiKey: ApiKey = {
        id: `ak_${userId}`,
        user_id: userId,
        project_id: null,
        principal_kind: kind,
        transition_scopes: [],
        key_prefix: 'test',
        name: 'test',
      };
      c.set('apiKey', apiKey);
      if (denyCapacity)
        c.set('projectLifecyclePolicy', {
          execute: async () => {
            throw new ProjectLifecyclePolicyDeniedError('CAPACITY_DENIED', 'Full', 409);
          },
        });
      return next();
    });
    app.route('/', projectRoutes);
    return app;
  }

  function create(app: Hono, body: Record<string, unknown> = {}) {
    return app.request('/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'My PRD', starter: 'prd-v1', ...body }),
    });
  }

  beforeAll(async () => {
    process.env.AUTH_DISABLED = 'false';
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    await mockDB.insert(users).values([{ id: owner }, { id: 'user_other_starter' }]);
    await insertPersonalNamespace(mockDB, { slug: 'prd-starter-owner', ownerUserId: owner });
    await insertPersonalNamespace(mockDB, {
      slug: 'prd-starter-other',
      ownerUserId: 'user_other_starter',
    });
  });
  afterAll(async () => {
    if (originalAuth === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = originalAuth;
    await cleanup?.();
  });

  it('creates a private project with a verified, human-authored canonical initial commit', async () => {
    const response = await create(appFor(), { visibility: 'public', actor: { id: 'forged' } });
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.visibility).toBe('private');
    const head = await getTransitionRefHead(mockDB, {
      projectId: data.project_id,
      refName: 'main',
    });
    expect(head.format).toBe('transition_v2');
    expect(head.head).not.toBeNull();
    const graph = await getVerifiedTransitionCommitGraph(mockDB, data.project_id, head.head!);
    expect(graph).not.toBeNull();
    expect(graph!.proposal.actor).toEqual({ kind: 'human', id: `user:${owner}` });
    expect(decodeRepositorySemanticContentState(graph!.state)).toEqual(
      createPrdStarterContent('My PRD')
    );
    expect(graph!.commit.parents).toEqual([]);
  });

  it('preserves empty project creation when no starter is requested', async () => {
    const response = await create(appFor(), { starter: undefined });
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(
      (await getTransitionRefHead(mockDB, { projectId: data.project_id, refName: 'main' })).head
    ).toBeNull();
  });

  it('rejects unknown starters before mutation', async () => {
    const before = await mockDB.select().from(projects);
    expect((await create(appFor(), { starter: 'remote-url' })).status).toBe(400);
    expect(await mockDB.select().from(projects)).toHaveLength(before.length);
  });

  it('cannot bypass namespace ownership, machine creation denial, or hosted capacity', async () => {
    const before = await mockDB.select().from(projects);
    expect((await create(appFor(), { namespace: 'prd-starter-other' })).status).toBe(403);
    expect((await create(appFor(owner, false, 'agent'))).status).toBe(403);
    expect((await create(appFor(owner, true))).status).toBe(409);
    expect(await mockDB.select().from(projects)).toHaveLength(before.length);
  });

  it('rolls back the project if initial Transition persistence fails', async () => {
    const before = await mockDB.select().from(projects);
    const writer = await import('../lib/repository-state-transition');
    const fail = vi
      .spyOn(writer, 'commitRepositoryYOpsState')
      .mockRejectedValueOnce(new Error('storage unavailable'));
    try {
      expect((await create(appFor())).status).toBe(500);
      expect(await mockDB.select().from(projects)).toHaveLength(before.length);
    } finally {
      fail.mockRestore();
    }
  });
});
