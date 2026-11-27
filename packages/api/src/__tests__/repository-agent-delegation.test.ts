import {
  type AnyDB,
  bindTransitionPolicy,
  createApiKey,
  createSession,
  createUser,
  ensureMainBranch,
  findApiKeyByValue,
  getTransitionPolicyBinding,
  insertBranch,
  insertProject,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import {
  requestPrincipalFromApiKey,
  requestPrincipalFromSession,
  setRequestPrincipal,
} from '../lib/request-principal';

const runtime = vi.hoisted(() => ({ db: null as unknown as AnyDB }));
vi.mock('../lib/db', () => ({ getDB: async () => runtime.db, closeDB: async () => {} }));

import {
  delegatedRefPolicy,
  issueRepositoryAgentDelegation,
  listRepositoryAgentDelegations,
  repairRepositoryAgentDelegation,
  revokeRepositoryAgentDelegation,
  updateRepositoryAgentDelegation,
} from '../lib/repository-agent-delegation';
import { allowsRepositoryDelegationRequest } from '../lib/repository-delegation-surface';
import { INDEPENDENT_REVIEW_REF_POLICY } from '../lib/transition-control-plane/applicable-policy';
import { createTestRateLimitStore, setupTestDB } from './setup';

describe('Repository delegation', () => {
  let setup: Awaited<ReturnType<typeof setupTestDB>>;
  let userId: string;
  let projectId: string;
  beforeAll(async () => {
    setup = await setupTestDB();
    runtime.db = setup.db;
    userId = (await createUser(setup.db, { name: 'Editor', email: 'delegate@example.test' })).id;
    projectId = (await insertProject(setup.db, { name: 'Editorial', ownerId: userId })).projectId;
    await ensureMainBranch(setup.db, projectId);
    await insertBranch(setup.db, { projectId, name: 'release' });
  });
  afterAll(async () => {
    await setup?.cleanup();
  });
  const options = { branch: 'main', branchOnly: true, mode: 'commit' as const, days: 7 };
  const actor = (id: string) => ({ kind: 'agent', id: `agent:api-key:${id}` });
  it('requires a managing human, rotates atomically, honors narrowing, and preserves existing branch policy', async () => {
    const input = { projectId, userId, agentName: 'Editorial agent', clientId: 'editor', options };
    await expect(
      issueRepositoryAgentDelegation(setup.db, { ...input, userId: 'stranger' })
    ).rejects.toMatchObject({ status: 403 });
    const old = await issueRepositoryAgentDelegation(setup.db, input);
    expect(old.grant.legacy).toBe(false);
    await expect(
      updateRepositoryAgentDelegation(setup.db, {
        ...input,
        id: old.grant.id,
        options: { ...options, branchOnly: false },
      })
    ).rejects.toMatchObject({ status: 409 });
    const fresh = await issueRepositoryAgentDelegation(setup.db, {
      ...input,
      options: { ...options, branchOnly: false },
    });
    expect(await findApiKeyByValue(setup.db, old.credential)).toBeNull();
    expect(await getTransitionPolicyBinding(setup.db, projectId, 'main')).toBeNull();
    expect(
      await delegatedRefPolicy(setup.db, projectId, 'main', actor(fresh.grant.id), null)
    ).toBeTruthy();
    expect(
      await delegatedRefPolicy(setup.db, projectId, 'release', actor(old.grant.id), null)
    ).toBeNull();
    expect(await delegatedRefPolicy(setup.db, projectId, 'main', actor('other'), null)).toBeNull();
    await bindTransitionPolicy(setup.db, {
      projectId,
      refName: 'release',
      actor: { kind: 'human', id: userId },
      policy: INDEPENDENT_REVIEW_REF_POLICY.policy,
      uri: INDEPENDENT_REVIEW_REF_POLICY.resource.uri,
    });
    await updateRepositoryAgentDelegation(setup.db, {
      ...input,
      id: fresh.grant.id,
      options: { ...options, branchOnly: false },
    });
    const branchPolicy = await getTransitionPolicyBinding(setup.db, projectId, 'release');
    expect(
      (
        await delegatedRefPolicy(
          setup.db,
          projectId,
          'release',
          actor(fresh.grant.id),
          branchPolicy
        )
      )?.policy.authorization.allowSelfApproval
    ).toBe(false);
    const gate = new Hono();
    gate.all('*', async (c) =>
      c.text(
        'operation',
        (await allowsRepositoryDelegationRequest(c, setup.db, fresh.grant.id)) ? 200 : 403
      )
    );
    const open = (ref: string) =>
      gate.request(`/v1/projects/${projectId}/workspaces`, {
        method: 'POST',
        body: JSON.stringify({ ref }),
      });
    expect((await open('release')).status).toBe(200);
    await setup.sql`UPDATE namespace_memberships SET role='viewer' WHERE principal_id=${userId}`;
    expect((await open('main')).status).toBe(403);
    expect((await gate.request(`/v1/projects/${projectId}`)).status).toBe(200);
    await setup.sql`UPDATE namespace_memberships SET role='owner' WHERE principal_id=${userId}`;
    await updateRepositoryAgentDelegation(setup.db, { ...input, id: fresh.grant.id, options });
    expect((await open('release')).status).toBe(403);
    expect((await open('main')).status).toBe(200);
    await updateRepositoryAgentDelegation(setup.db, {
      ...input,
      id: fresh.grant.id,
      options: { ...options, mode: 'read' },
    });
    expect((await open('main')).status).toBe(403);
    await expect(
      updateRepositoryAgentDelegation(setup.db, { ...input, id: fresh.grant.id, options })
    ).rejects.toMatchObject({ status: 409 });
    expect((await findApiKeyByValue(setup.db, fresh.credential))?.transition_scopes).toEqual([
      'transition:inspect',
    ]);
    await revokeRepositoryAgentDelegation(setup.db, { projectId, userId, id: fresh.grant.id });
    expect(await findApiKeyByValue(setup.db, fresh.credential)).toBeNull();
    expect((await gate.request(`/v1/projects/${projectId}`)).status).toBe(403);
  });
  it('applies the exact same credential ceiling after hosted authentication', async () => {
    const input = {
      projectId,
      userId,
      agentName: 'Cloud agent',
      clientId: 'hosted',
      options: { ...options, mode: 'read' as const },
    };
    const delegated = await issueRepositoryAgentDelegation(setup.db, input);
    const credential = await findApiKeyByValue(setup.db, delegated.credential);
    if (!credential) throw new Error('Missing test credential');
    let authenticated = credential;
    const { app } = createApp({
      skipBuiltinAuth: true,
      rateLimitStore: createTestRateLimitStore(),
      middleware: [
        async (c, next) => {
          setRequestPrincipal(c, requestPrincipalFromApiKey(authenticated, 'http'));
          await next();
        },
      ],
    });
    expect((await app.request('/api/v1/auth/me/credential')).status).toBe(200);
    expect((await app.request('/api/v1/api-keys')).status).toBe(403);
    expect((await app.request(`/api/v1/projects/${projectId}/yschema/catalog`)).status).toBe(200);
    expect((await app.request('/api/v1/yschema/catalog')).status).toBe(200);
    const schema = (path: string) =>
      app.request(`/api/v1/projects/${projectId}/schema-studio/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    expect((await schema('preview')).status).toBe(403);
    expect(
      (
        await app.request(`/api/v1/projects/${projectId}/workspaces`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: 'foreign', ref: 'main', expected_head: null }),
        })
      ).status
    ).toBe(403);
    await revokeRepositoryAgentDelegation(setup.db, { projectId, userId, id: delegated.grant.id });
    // Even a host which resolved the identity before revocation cannot use the old grant.
    expect((await app.request('/api/v1/auth/me/credential')).status).toBe(403);
    const editor = await issueRepositoryAgentDelegation(setup.db, {
      ...input,
      options: { ...options, mode: 'prepare' },
    });
    const editingCredential = await findApiKeyByValue(setup.db, editor.credential);
    if (!editingCredential) throw new Error('Missing preparing credential');
    authenticated = editingCredential;
    // Editable credentials reach preview validation. User adoption remains a separate operation.
    expect((await schema('preview')).status).toBe(400);
    expect((await schema('preparation/workspace/preview')).status).toBe(400);
    expect((await schema('preparation/workspace')).status).toBe(403);
  });
  it('repairs an existing Agent key without rotating it or adding any scopes', async () => {
    const key = await createApiKey(setup.db, {
      projectId,
      userId,
      principalKind: 'agent',
      credentialKind: 'agent',
      name: 'manual token',
      keyValue: 't3xk_existing_legacy',
      transitionScopes: ['transition:inspect', 'transition:propose', 'transition:verify'],
    });
    expect(await delegatedRefPolicy(setup.db, projectId, 'main', actor(key.id), null)).toBeNull();
    expect(await listRepositoryAgentDelegations(setup.db, { projectId, userId })).toContainEqual(
      expect.objectContaining({ id: key.id, legacy: true, needsPolicy: true })
    );
    const repaired = await repairRepositoryAgentDelegation(setup.db, {
      projectId,
      userId,
      id: key.id,
      branch: 'main',
    });
    expect(repaired).toMatchObject({
      id: key.id,
      mode: 'prepare',
      legacy: true,
      branch: 'main',
      expiresAt: null,
    });
    expect((await findApiKeyByValue(setup.db, 't3xk_existing_legacy'))?.transition_scopes).toEqual(
      key.transition_scopes
    );
    expect(await delegatedRefPolicy(setup.db, projectId, 'main', actor(key.id), null)).toBeTruthy();
    expect(
      await delegatedRefPolicy(setup.db, projectId, 'release', actor(key.id), null)
    ).toBeNull();
  });
  it('lists and revokes only the selected manual credential through repository settings before repair', async () => {
    const protectedRef = 'protected-manual';
    await insertBranch(setup.db, { projectId, name: protectedRef });
    await bindTransitionPolicy(setup.db, {
      projectId,
      refName: protectedRef,
      actor: { kind: 'human', id: userId },
      policy: INDEPENDENT_REVIEW_REF_POLICY.policy,
      uri: INDEPENDENT_REVIEW_REF_POLICY.resource.uri,
    });
    const manual = {
      name: 'Same display name',
      projectId,
      userId,
      credentialKind: 'agent' as const,
      principalKind: 'agent' as const,
      transitionScopes: ['transition:inspect', 'transition:propose', 'transition:verify'] as const,
    };
    const first = await createApiKey(setup.db, { ...manual, keyValue: 't3xk_old_first' });
    const second = await createApiKey(setup.db, { ...manual, keyValue: 't3xk_old_second' });
    const human = await createApiKey(setup.db, {
      projectId,
      userId,
      name: 'PAT',
      keyValue: 't3xk_human',
    });
    const session = await createSession(setup.db, {
      rawToken: 't3xs_management',
      authMethod: 'local_password',
      expiresAt: new Date(Date.now() + 86400_000),
      userId,
    });
    const { app } = createApp({
      skipBuiltinAuth: true,
      rateLimitStore: createTestRateLimitStore(),
      middleware: [
        async (c, next) => {
          setRequestPrincipal(c, requestPrincipalFromSession(session, 'http'));
          await next();
        },
      ],
    });
    const endpoint = '/api/v1/mcp-delegations';
    const list = async (branch: string) => {
      const response = await app.request(`${endpoint}?projectId=${projectId}&branch=${branch}`);
      expect(response.status).toBe(200);
      return (await response.json()).grants;
    };
    const revoke = (id: string, repository = projectId) =>
      app.request(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, projectId: repository }),
      });
    expect(await list('main')).toContainEqual(
      expect.objectContaining({ id: first.id, legacy: true, needsPolicy: true, branch: null })
    );
    expect(await list(protectedRef)).toContainEqual(
      expect.objectContaining({ id: first.id, legacy: true, needsPolicy: false })
    );
    const other = await insertProject(setup.db, { name: 'Another repository', ownerId: userId });
    expect((await revoke(first.id, other.projectId)).status).toBe(404);
    expect((await revoke(human.id)).status).toBe(404);
    expect((await revoke(first.id)).status).toBe(200);
    expect((await revoke(first.id)).status).toBe(200);
    expect(await findApiKeyByValue(setup.db, 't3xk_old_first')).toBeNull();
    expect((await findApiKeyByValue(setup.db, 't3xk_old_second'))?.id).toBe(second.id);
    expect((await findApiKeyByValue(setup.db, 't3xk_human'))?.id).toBe(human.id);
    expect(
      await delegatedRefPolicy(setup.db, projectId, 'main', actor(second.id), null)
    ).toBeNull();
    expect(await list('main')).not.toContainEqual(expect.objectContaining({ id: first.id }));
  });
});
