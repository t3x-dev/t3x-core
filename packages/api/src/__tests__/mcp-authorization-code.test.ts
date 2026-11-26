import { randomBytes } from 'node:crypto';
import { createUser, ensureMainBranch, findApiKeyByValue, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { authorizationRequest, digest, issuerConfig } from '../lib/mcp-authorization';
import { openMcpAccessToken } from '../lib/mcp-oauth';
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
  beforeAll(async () => {
    database = await setupTestDB();
    userId = (await createUser(database.db, { name: 'Owner', email: 'oauth@example.test' })).id;
    projectId = (await insertProject(database.db, { name: 'Planning', ownerId: userId })).projectId;
    await ensureMainBranch(database.db, projectId);
  });
  afterAll(async () => database?.cleanup());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function fixture(session = true) {
    const verifier = randomBytes(48).toString('base64url');
    vi.stubEnv(
      'T3X_MCP_OAUTH_CLIENTS',
      JSON.stringify([{ client_id: 'host', client_name: 'Chat', redirect_uris: [callback] }])
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
          t3x_capabilities: ['read-only'],
        })
      )
    );
    const app = new Hono<{ Variables: { requestPrincipal: unknown } }>();
    if (session)
      app.use('*', async (c, next) => {
        c.set('requestPrincipal', {
          userId,
          subject: { kind: 'human', principal_id: userId },
          credential: { kind: 'session' },
        });
        await next();
      });
    app.route('/', mcpDelegationRoutes);
    const params = new URLSearchParams({
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
    const approve = () =>
      send({
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
    return { app, params, send, approve, exchange, verifier };
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
    expect((await fixture(false).approve()).status).toBe(401);
    const { send } = fixture();
    const denied = await send({
      decision: 'approve',
      projectId,
      mode: 'commit',
      days: 7,
      branch: 'main',
      branchOnly: false,
    });
    expect(denied.status).toBe(400);
    const cancelled = await send({ decision: 'cancel' });
    const returned = new URL((await cancelled.json()).redirectTo);
    expect(returned.searchParams.get('error')).toBe('access_denied');
    expect(returned.searchParams.get('code')).toBeNull();
  });
  it('binds the code to its proof and returns one usable resource credential across concurrent exchanges', async () => {
    const { approve, exchange, verifier } = fixture();
    const [first, repeated] = await Promise.all([approve(), approve()]);
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
    expect(await findApiKeyByValue(database.db, token.access_token)).toBeNull();
    const key = openMcpAccessToken(token.access_token, resource, secret);
    expect((await findApiKeyByValue(database.db, key!))?.project_id).toBe(projectId);
  });
  it('refuses a code after the owner revokes the grant before exchange', async () => {
    const { app, approve, exchange, verifier } = fixture();
    const callbackResult = await (await approve()).json();
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
  });
});
