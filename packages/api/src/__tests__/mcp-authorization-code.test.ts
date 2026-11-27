import { randomBytes } from 'node:crypto';
import {
  bindTransitionPolicy,
  createUser,
  ensureMainBranch,
  findApiKeyByValue,
  insertProject,
} from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { authorizationRequest, digest, issuerConfig } from '../lib/mcp-authorization';
import { openMcpAccessToken } from '../lib/mcp-oauth';
import { INDEPENDENT_REVIEW_REF_POLICY } from '../lib/transition-control-plane/applicable-policy';
import { mcpDelegationRoutes } from '../routes/mcp-delegations.openapi';
import { setupTestDB } from './setup';

let database: Awaited<ReturnType<typeof setupTestDB>>;
vi.mock('../lib/db', () => ({ getDB: async () => database.db }));
const resource = 'https://mcp.example.test/mcp';
const issuer = 'https://web.example.test';
const callback = 'http://127.0.0.1:27182/return';
const secret = randomBytes(32).toString('base64url');

describe('repository OAuth consent and code exchange', () => {
  let userId: string;
  let projectId: string;
  let otherUserId: string;
  beforeAll(async () => {
    database = await setupTestDB();
    userId = (await createUser(database.db, { name: 'Owner', email: 'oauth@example.test' })).id;
    projectId = (await insertProject(database.db, { name: 'Planning', ownerId: userId })).projectId;
    await ensureMainBranch(database.db, projectId);
    otherUserId = (
      await createUser(database.db, { name: 'Second manager', email: 'manager@oauth.test' })
    ).id;
    await database.sql`INSERT INTO namespace_memberships(membership_id, namespace_id, principal_kind,principal_id,role,status)
      SELECT 'oauth-test-admin', namespace_id, 'human', ${otherUserId}, 'admin', 'active' FROM projects WHERE project_id=${projectId}`;
  });
  afterAll(async () => database?.cleanup());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function fixture(session = true, capabilities = ['read-only']) {
    const verifier = randomBytes(48).toString('base64url');
    vi.stubEnv(
      'T3X_MCP_OAUTH_CLIENTS',
      JSON.stringify([
        {
          client_id: 'host',
          client_name: 'Chat',
          redirect_uris: [callback],
          connection_start_uri: 'https://example.test/start',
        },
      ])
    );
    vi.stubEnv('T3X_MCP_RESOURCE_URL', resource);
    vi.stubEnv('T3X_MCP_OAUTH_ISSUER', issuer);
    vi.stubEnv('T3X_MCP_OAUTH_SECRET', secret);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          resource,
          authorization_servers: [issuer],
          t3x_capabilities: capabilities,
        })
      )
    );
    const app = new Hono<{ Variables: { requestPrincipal: unknown } }>();
    let actor = userId;
    if (session)
      app.use('*', async (c, next) => {
        c.set('requestPrincipal', {
          userId: actor,
          subject: { kind: 'human', principal_id: actor },
          credential: { kind: 'session' },
        });
        await next();
      });
    app.route('/', mcpDelegationRoutes);
    const params = new URLSearchParams({
      projectId,
      branchOnly: 'true',
      client_id: 'host',
      response_type: 'code',
      scope: 'repository:read',
      redirect_uri: callback,
      state: 'pending-task',
      resource,
      code_challenge_method: 'S256',
      code_challenge: digest(verifier),
    });
    const send = (decision: Record<string, unknown>) =>
      app.request('/v1/mcp-delegations/consent?' + params, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decision),
      });
    const preview = () => app.request('/v1/mcp-delegations/consent?' + params);
    const approve = (version: string) =>
      send({
        previewVersion: version,
        decision: 'approve',
        projectId,
        mode: 'read',
        days: 7,
        branch: 'main',
        branchOnly: true,
      });
    const exchange = (code: string, proof: string) =>
      app.request('/mcp-oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: 'host',
          grant_type: 'authorization_code',
          redirect_uri: callback,
          resource,
          code,
          code_verifier: proof,
        }),
      });
    return {
      app,
      params,
      send,
      approve,
      exchange,
      verifier,
      preview,
      as: (id: string) => {
        actor = id;
      },
    };
  }

  it('validates the registered callback, S256 and resource before offering consent', () => {
    const { params } = fixture();
    for (const [field, value] of [
      ['redirect_uri', 'https://another.example.test/callback'],
      ['code_challenge_method', 'plain'],
      ['resource', 'https://elsewhere.example.test/mcp'],
    ]) {
      const changed = new URLSearchParams(params);
      changed.set(field, value);
      expect(() => authorizationRequest(changed, issuerConfig())).toThrow();
    }
    params.append('scope', 'repository:commit');
    expect(() => authorizationRequest(params, issuerConfig())).toThrow();
  });
  it('requires a human session and explicit approval within the requested scope', async () => {
    expect((await fixture(false).preview()).status).toBe(401);
    const { send, preview, approve } = fixture();
    expect((await send({ decision: 'cancel' })).status).toBe(409);
    const { previewVersion } = await (await preview()).json();
    const denied = await send({
      previewVersion,
      decision: 'approve',
      projectId,
      mode: 'commit',
      days: 7,
      branch: 'main',
      branchOnly: false,
    });
    expect(denied.status).toBe(409);
    const cancelled = await send({ decision: 'cancel', previewVersion });
    const returned = new URL((await cancelled.json()).redirectTo);
    expect(returned.searchParams.get('error')).toBe('access_denied');
    expect(returned.searchParams.get('code')).toBeNull();
    expect(await (await preview()).json()).toMatchObject({
      status: 'cancelled',
      previewVersion: null,
    });
    expect((await approve(previewVersion)).status).toBe(409);
  });
  it('offers only clients with a usable registered callback in Web', async () => {
    const { app } = fixture();
    vi.stubEnv(
      'T3X_MCP_OAUTH_CLIENTS',
      JSON.stringify([
        { client_id: 'host', client_name: 'Chat', redirect_uris: [callback] },
        {
          client_id: 'misconfigured',
          client_name: 'Unavailable',
          redirect_uris: ['http://remote.example.test/return'],
        },
      ])
    );
    const choices = await (await app.request('/v1/mcp-delegations/preselections')).json();
    expect(choices.clients).toEqual([{ id: 'host', name: 'Chat' }]);
  });
  it('binds the code to its proof and returns one usable resource credential across concurrent exchanges', async () => {
    const { approve, exchange, verifier, preview } = fixture();
    const { previewVersion } = await (await preview()).json();
    const [first, repeated] = await Promise.all([approve(previewVersion), approve(previewVersion)]);
    expect([first.status, repeated.status]).toEqual([200, 200]);
    const returned = new URL((await first.json()).redirectTo);
    expect((await repeated.json()).redirectTo).toBe(returned.href);
    expect(returned.searchParams.get('state')).toBe('pending-task');
    expect(returned.searchParams.get('iss')).toBe(issuer);
    const code = returned.searchParams.get('code')!;
    expect((await exchange(code, randomBytes(48).toString('base64url'))).status).toBe(400);
    const attempts = await Promise.all([exchange(code, verifier), exchange(code, verifier)]);
    expect(attempts.map((r) => r.status).sort()).toEqual([200, 400]);
    const token = await attempts.find((r) => r.ok)!.json();
    expect(token.scope).toBe('repository:read');
    expect(await (await preview()).json()).toMatchObject({ status: 'token_issued' });
    expect(await findApiKeyByValue(database.db, token.access_token)).toBeNull();
    const key = openMcpAccessToken(token.access_token, resource, secret);
    expect((await findApiKeyByValue(database.db, key!))?.project_id).toBe(projectId);
  });
  it('refuses a code after the owner revokes the grant before exchange', async () => {
    const { app, approve, exchange, verifier, preview } = fixture();
    const { previewVersion } = await (await preview()).json();
    const callbackResult = await (await approve(previewVersion)).json();
    const list = await (await app.request('/v1/mcp-delegations?projectId=' + projectId)).json();
    const grant = list.grants.find((entry: { revoked: boolean }) => !entry.revoked);
    const stop = await app.request('/v1/mcp-delegations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, id: grant.id }),
    });
    expect(stop.ok).toBe(true);
    const code = new URL(callbackResult.redirectTo).searchParams.get('code')!;
    expect((await exchange(code, verifier)).status).toBe(400);
    expect(await (await preview()).json()).toMatchObject({ status: 'spent_without_token' });
  });

  it('keeps approval and cancellation bound to the manager who reviewed the terms', async () => {
    const hosted = fixture();
    const second = fixture();
    second.as(otherUserId);
    expect((await second.preview()).ok).toBe(true);
    const { previewVersion } = await (await hosted.preview()).json();
    hosted.as(otherUserId);
    expect((await hosted.preview()).status).toBe(404);
    expect((await hosted.approve(previewVersion)).status).toBe(404);
    expect((await hosted.send({ decision: 'cancel', previewVersion })).status).toBe(404);
    hosted.as(userId);
    expect((await hosted.approve(previewVersion)).ok).toBe(true);
  });

  it('requires a fresh replacement preview when separate client requests observed the same grant', async () => {
    const one = fixture();
    const two = fixture();
    const previews = await Promise.all(
      [one.preview(), two.preview()].map(async (response) => (await response).json())
    );
    const approvals = await Promise.all([
      one.approve(previews[0].previewVersion),
      two.approve(previews[1].previewVersion),
    ]);
    expect(approvals.map((response) => response.status).sort()).toEqual([200, 409]);
    const losing = approvals[0].ok ? two : one;
    const updated = await (await losing.preview()).json();
    expect(updated.priorGrant.id).not.toBe(previews[0].priorGrant?.id);
    expect((await losing.approve(updated.previewVersion)).ok).toBe(true);
  });

  it('rechecks delegation management authority when the previewed membership changes', async () => {
    const hosted = fixture();
    hosted.as(otherUserId);
    const { previewVersion } = await (await hosted.preview()).json();
    await database.sql`UPDATE namespace_memberships SET role='viewer' WHERE membership_id='oauth-test-admin'`;
    try {
      expect((await hosted.approve(previewVersion)).status).toBe(404);
      expect((await hosted.preview()).status).toBe(404);
    } finally {
      await database.sql`UPDATE namespace_memberships SET role='admin' WHERE membership_id='oauth-test-admin'`;
    }
    expect((await (await hosted.preview()).json()).status).toBe('pending');
  });

  it('invalidates stale previews when the grant revision or displayed policy changes, and exchanges the current scope', async () => {
    const hosted = fixture(true, [
      'read-only',
      'workspace',
      'workspace:write',
      'transitions',
      'transitions:prepare',
      'transitions:verify',
      'schemas',
      'decision:accept',
      'decision:reject',
      'commit',
    ]);
    hosted.params.set('scope', 'repository:commit');
    const commitDecision = (previewVersion: string) =>
      hosted.send({
        previewVersion,
        decision: 'approve',
        projectId,
        mode: 'commit',
        branch: 'main',
        branchOnly: true,
        days: 7,
      });
    const eligible = await (await hosted.preview()).json();
    expect(eligible.selected.outcome).toBe('eligible');
    await bindTransitionPolicy(database.db, {
      projectId,
      refName: 'main',
      actor: { kind: 'human', id: userId },
      policy: INDEPENDENT_REVIEW_REF_POLICY.policy,
      uri: INDEPENDENT_REVIEW_REF_POLICY.resource.uri,
    });
    expect((await commitDecision(eligible.previewVersion)).status).toBe(409);
    const protectedRef = await (await hosted.preview()).json();
    expect(protectedRef.selected.outcome).toBe('protected');
    const issued = await (await commitDecision(protectedRef.previewVersion)).json();
    const code = new URL(issued.redirectTo).searchParams.get('code')!;
    const next = fixture();
    const previousTerms = await (await next.preview()).json();
    const narrowed = await next.app.request('/v1/mcp-delegations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        id: previousTerms.priorGrant.id,
        mode: 'read',
        days: 1,
        branch: 'main',
      }),
    });
    expect(narrowed.status).toBe(200);
    expect((await next.approve(previousTerms.previewVersion)).status).toBe(409);
    const token = await hosted.exchange(code, hosted.verifier);
    expect(token.status).toBe(200);
    expect((await token.json()).scope).toBe('repository:read');
  });

  it('records one decision when confirmation races cancellation', async () => {
    const hosted = fixture();
    const terms = await (await hosted.preview()).json();
    const answers = await Promise.all([
      hosted.approve(terms.previewVersion),
      hosted.send({ decision: 'cancel', previewVersion: terms.previewVersion }),
    ]);
    expect(answers.map((result) => result.status).sort()).toEqual([200, 409]);
    const terminal = await (await hosted.preview()).json();
    expect(terminal.status).toBe(answers[0].ok ? 'approved' : 'cancelled');
    expect(terminal.previewVersion).toBeNull();
  });

  it('makes a Web preselection explicit, single-use and independent from an ordinary Chat request', async () => {
    const web = fixture();
    const catalog = '/v1/mcp-delegations/preselections';
    const choices = await (await web.app.request(catalog)).json();
    expect(choices.clients).toContainEqual({ id: 'host', name: 'Chat' });
    expect(choices.repositories.map((p: { id: string }) => p.id)).toContain(projectId);
    const saved = await (
      await web.app.request(catalog, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, clientId: 'host', branch: 'main' }),
      })
    ).json();
    expect(new URL(saved.launchUrl).searchParams.get('preselection')).toBe(saved.id);
    expect(saved.resourceUrl).toBe(resource);
    const ordinary = fixture();
    const before = await (await ordinary.preview()).json();
    expect(before.preselections.map((s: { id: string }) => s.id)).toContain(saved.id);
    expect(before.repositoryLocked).toBe(false);
    expect((await ordinary.approve(before.previewVersion)).ok).toBe(true);
    const other = fixture();
    other.as(otherUserId);
    other.params.set('preselection', saved.id);
    expect((await other.preview()).status).toBe(404);
    web.params.set('useSelection', saved.id);
    const chosen = await (await web.preview()).json();
    expect(chosen.repositoryLocked).toBe(true);
    const registered = fixture();
    registered.params.set('preselection', saved.id);
    const competing = await (await registered.preview()).json();
    expect((await web.approve(chosen.previewVersion)).ok).toBe(true);
    expect((await web.approve(chosen.previewVersion)).ok).toBe(true);
    expect((await registered.approve(competing.previewVersion)).ok).toBe(false);
  });
});
