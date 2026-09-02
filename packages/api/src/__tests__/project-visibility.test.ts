import type { ApiKey } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  changeProjectVisibility,
  insertPersonalNamespace,
  insertProject,
  namespaceMemberships,
  projectGrants,
  users,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  ProjectVisibilityPolicy,
  ProjectVisibilityPolicyInput,
} from '../lib/project-visibility-policy';
import { ProjectVisibilityPolicyDeniedError } from '../lib/project-visibility-policy';
import { createProjectVisibilityRoutes } from '../routes/project-visibility.openapi';
import { projectRoutes } from '../routes/projects.openapi';
import { setupTestDB } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

function appFor(userId: string | null, routes: Hono) {
  const app = new Hono();
  if (userId) {
    app.use('*', async (c, next) => {
      const apiKey: ApiKey = {
        id: `ak_${userId}`,
        user_id: userId,
        project_id: null,
        principal_kind: 'human',
        transition_scopes: [],
        key_prefix: 'test',
        name: 'test',
      };
      c.set('apiKey', apiKey);
      return next();
    });
  }
  app.route('/', routes);
  return app;
}

function visibilityRequest(
  app: Hono,
  projectId: string,
  body: { expected_visibility: string; visibility: string; confirm_publication?: boolean }
) {
  return app.request(`/v1/projects/${projectId}/visibility`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('project visibility command route', () => {
  let cleanup: () => Promise<void>;
  let namespaceId: string;
  let projectId: string;
  let deniedProjectId: string;
  let publicProjectId: string;
  const originalAuthDisabled = process.env.AUTH_DISABLED;

  beforeAll(async () => {
    process.env.AUTH_DISABLED = 'false';
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
    await mockDB.insert(users).values([
      { id: 'user_visibility_owner', emailVerified: true },
      { id: 'user_visibility_editor', emailVerified: true },
      { id: 'user_visibility_guest', emailVerified: true },
    ]);
    const namespace = await insertPersonalNamespace(mockDB, {
      slug: 'visibility-route',
      ownerUserId: 'user_visibility_owner',
    });
    namespaceId = namespace.namespaceId;
    await mockDB.insert(namespaceMemberships).values({
      membershipId: 'nsm_visibility_editor',
      namespaceId,
      principalKind: 'human',
      principalId: 'user_visibility_editor',
      role: 'editor',
      status: 'active',
    });
    const created = await Promise.all([
      insertProject(mockDB, { name: 'Visibility route', namespaceId }),
      insertProject(mockDB, { name: 'Visibility denied', namespaceId }),
      insertProject(mockDB, { name: 'Visibility public read guard', namespaceId }),
    ]);
    projectId = created[0].projectId;
    deniedProjectId = created[1].projectId;
    publicProjectId = created[2].projectId;
    await mockDB.insert(projectGrants).values({
      grantId: 'grant_visibility_guest',
      projectId,
      namespaceId,
      principalKind: 'human',
      principalId: 'user_visibility_guest',
      role: 'admin',
      status: 'active',
    });
  });

  afterAll(async () => {
    if (originalAuthDisabled === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = originalAuthDisabled;
    await cleanup();
  });

  it('runs the host policy around one compare-and-set mutation', async () => {
    const seen: ProjectVisibilityPolicyInput[] = [];
    const policy: ProjectVisibilityPolicy = {
      execute: async (input, mutate) => {
        seen.push(input);
        return mutate();
      },
    };
    const response = await visibilityRequest(
      appFor('user_visibility_owner', createProjectVisibilityRoutes(policy)),
      projectId,
      { expected_visibility: 'private', visibility: 'unlisted' }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { changed: true, project: { visibility: 'unlisted' } },
    });
    expect(seen).toMatchObject([
      {
        contractVersion: 1,
        projectId,
        namespaceId,
        fromVisibility: 'private',
        toVisibility: 'unlisted',
        actor: { kind: 'human', id: 'user_visibility_owner' },
      },
    ]);
  });

  it('reserves visibility management for namespace owner/admin authority', async () => {
    for (const userId of ['user_visibility_editor', 'user_visibility_guest']) {
      const response = await visibilityRequest(
        appFor(userId, createProjectVisibilityRoutes()),
        projectId,
        { expected_visibility: 'unlisted', visibility: 'private' }
      );
      expect(response.status).toBe(403);
    }
  });

  it('returns a host policy denial without mutating the project', async () => {
    const policy: ProjectVisibilityPolicy = {
      execute: async () => {
        throw new ProjectVisibilityPolicyDeniedError(
          'PRIVATE_PROJECT_CAPACITY_EXCEEDED',
          'Private project capacity is exhausted',
          409
        );
      },
    };
    const response = await visibilityRequest(
      appFor('user_visibility_owner', createProjectVisibilityRoutes(policy)),
      deniedProjectId,
      { expected_visibility: 'private', visibility: 'unlisted' }
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'PRIVATE_PROJECT_CAPACITY_EXCEEDED' },
    });
  });

  it('fails stale expectations before invoking deployment policy', async () => {
    const execute = vi.fn();
    const response = await visibilityRequest(
      appFor('user_visibility_owner', createProjectVisibilityRoutes({ execute })),
      projectId,
      { expected_visibility: 'private', visibility: 'public', confirm_publication: true }
    );

    expect(response.status).toBe(409);
    expect(execute).not.toHaveBeenCalled();
  });

  it('requires explicit publication confirmation', async () => {
    const response = await visibilityRequest(
      appFor('user_visibility_owner', createProjectVisibilityRoutes()),
      deniedProjectId,
      { expected_visibility: 'private', visibility: 'public' }
    );
    expect(response.status).toBe(400);
  });

  it('rejects visibility on the generic project update route', async () => {
    const response = await appFor('user_visibility_owner', projectRoutes).request(
      `/v1/projects/${projectId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'public' }),
      }
    );
    expect(response.status).toBe(400);
  });

  it('does not turn public visibility into an anonymous read authority', async () => {
    await changeProjectVisibility(mockDB, {
      projectId: publicProjectId,
      namespaceId,
      expectedVisibility: 'private',
      visibility: 'public',
      actor: { kind: 'human', id: 'user_visibility_owner' },
      publicationConfirmed: true,
    });

    const response = await appFor(null, projectRoutes).request(`/v1/projects/${publicProjectId}`);
    expect(response.status).toBe(403);
  });
});
