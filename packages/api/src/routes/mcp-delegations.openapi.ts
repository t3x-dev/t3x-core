import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createMcpPreselection,
  findApiKeyByValue,
  findBranchByName,
  findCurrentBranch,
  McpPreselectionLimitError,
  readAgentDelegation,
  recordMcpExchangeOutcome,
  redeemMcpAuthorizationCode,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getDB } from '../lib/db';
import {
  AuthorizationError,
  checkParameters,
  codeSecret,
  delegationModes,
  digest,
  issuerConfig,
  registeredClient,
  registeredClients,
  scopeFor,
} from '../lib/mcp-authorization';
import { decideMcpConsent, previewMcpConsent } from '../lib/mcp-consent';
import { canDelegate, delegationDays, repositoryChoices } from '../lib/mcp-consent-preview';
import { openMcpAccessToken, sealMcpAccessToken } from '../lib/mcp-oauth';
import {
  listRepositoryAgentDelegations,
  type RepositoryAgentGrant,
  RepositoryDelegationError,
  repairRepositoryAgentDelegation,
  revokeRepositoryAgentDelegation,
  updateRepositoryAgentDelegation,
} from '../lib/repository-agent-delegation';
import { getRequestPrincipal } from '../lib/request-principal';

export const mcpDelegationRoutes = new OpenAPIHono();
const routes = mcpDelegationRoutes;
const base = '/v1/mcp-delegations';
const consent = base + '/consent';
const publicBase = '/mcp-oauth';
const id = z.string().min(1).max(255);
const registeredClientId = z.string().min(1).max(256);
const updateSchema = z.object({
  projectId: id,
  id,
  branch: id.nullable(),
  mode: z.enum(delegationModes),
  days: delegationDays,
});

const grantSchema = z.object({
  id,
  clientName: z.string(),
  mode: z.enum(delegationModes),
  branch: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revoked: z.boolean(),
  needsPolicy: z.boolean().optional(),
  legacy: z.boolean(),
});
const repositorySchema = z.object({ id, name: z.string() });
const consentResponse = z.object({
  clientName: z.string(),
  repositories: z.array(repositorySchema),
  repositoryLocked: z.boolean(),
  scope: z.enum(delegationModes),
  status: z.enum([
    'pending',
    'approved',
    'cancelled',
    'expired',
    'token_issued',
    'spent_without_token',
    'code_expired',
    'closed',
  ]),
  account: z.object({ id, name: z.string() }),
  priorGrant: z.object({ id, clientName: z.string() }).nullable(),
  mode: z.enum(delegationModes),
  days: delegationDays,
  branchOnly: z.boolean(),
  previewVersion: z.string().nullable(),
  preselections: z.array(z.object({ id, projectId: id, repository: z.string(), branch: id })),
  selected: repositorySchema
    .extend({
      branch: z.string(),
      outcome: z.string(),
      detail: z.string(),
      readinessDetail: z.string().optional(),
    })
    .nullable(),
});
const success = (schema: z.ZodType) => ({
  200: { description: 'Result', content: { 'application/json': { schema } } },
});
const failures = {
  400: { description: 'Invalid request' },
  401: { description: 'Authentication required' },
  403: { description: 'Insufficient authority' },
  404: { description: 'Not available' },
  409: { description: 'Selection or grant changed' },
  429: { description: 'Too many authorization attempts or saved selections' },
  503: { description: 'Service unavailable' },
};
const previewConsent = createRoute({
  method: 'get',
  path: '/v1/mcp-delegations/consent',
  tags: ['MCP authorization'],
  summary: 'Preview consent for a registered MCP client',
  responses: { ...success(consentResponse), ...failures },
});
const decideConsent = createRoute({
  method: 'post',
  path: '/v1/mcp-delegations/consent',
  tags: ['MCP authorization'],
  summary: 'Approve or cancel a repository delegation',
  responses: { ...success(z.object({ redirectTo: z.string() })), ...failures },
});
const listChoices = createRoute({
  method: 'get',
  path: '/v1/mcp-delegations/preselections',
  tags: ['MCP authorization'],
  summary: 'Choose a registered Agent and delegable repository',
  responses: {
    ...success(
      z.object({
        clients: z.array(z.object({ id: registeredClientId, name: z.string() })),
        repositories: z.array(repositorySchema),
      })
    ),
    ...failures,
  },
});
const saveSelection = createRoute({
  method: 'post',
  path: '/v1/mcp-delegations/preselections',
  tags: ['MCP authorization'],
  summary: 'Save a short-lived Web preselection for one client authorization',
  responses: {
    ...success(z.object({ id, expiresAt: z.string(), launchUrl: z.string().nullable() })),
    ...failures,
  },
});
const listGrants = createRoute({
  method: 'get',
  path: '/v1/mcp-delegations',
  tags: ['MCP authorization'],
  summary: 'List repository Agent delegations',
  responses: { ...success(z.object({ grants: z.array(grantSchema) })), ...failures },
});
const revokeGrant = createRoute({
  method: 'delete',
  path: '/v1/mcp-delegations',
  tags: ['MCP authorization'],
  summary: 'Revoke a repository delegation',
  responses: { ...success(z.object({ revoked: z.boolean() })), ...failures },
});
const editGrant = createRoute({
  method: 'patch',
  path: '/v1/mcp-delegations',
  tags: ['MCP authorization'],
  summary: 'Update or complete an existing repository delegation',
  responses: { ...success(z.object({ grant: grantSchema })), ...failures },
});
const issuerMetadata = createRoute({
  method: 'get',
  path: '/mcp-oauth/metadata',
  tags: ['MCP authorization'],
  summary: 'Discover the MCP authorization server',
  responses: { ...success(z.record(z.string(), z.unknown())), ...failures },
});
const exchangeCode = createRoute({
  method: 'post',
  path: '/mcp-oauth/token',
  tags: ['MCP authorization'],
  summary: 'Exchange a single-use authorization code with S256 PKCE',
  responses: {
    ...success(
      z.object({
        access_token: z.string(),
        token_type: z.string(),
        expires_in: z.number(),
        scope: z.string(),
      })
    ),
    ...failures,
  },
});

const invalid = (message: string) => new AuthorizationError(400, message);

for (const path of [base, consent, base + '/preselections', publicBase + '/*'])
  routes.use(path, async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');
    await next();
  });
routes.use(
  publicBase + '/token',
  bodyLimit({ maxSize: 8192, onError: (c) => c.json({ error: 'invalid_request' }, 413) })
);
routes.onError((err, c) => {
  if (err instanceof McpPreselectionLimitError)
    return c.json(
      { error: 'Too many pending selections. Use an existing selection or wait for expiry.' },
      429
    );
  if (err instanceof AuthorizationError || err instanceof RepositoryDelegationError)
    return c.json({ error: err.message }, err.status);
  if (err instanceof z.ZodError || err instanceof SyntaxError)
    return c.json({ error: 'Invalid request.' }, 400);
  return c.json({ error: 'Repository authorization is temporarily unavailable.' }, 503);
});

function sessionUser(c: Context) {
  const p = getRequestPrincipal(c);
  if (p?.subject.kind !== 'human' || p.credential.kind !== 'session' || !p.userId)
    throw new AuthorizationError(401, 'Sign in to T3X to manage repository access.');
  return p.userId;
}

function presentGrant(grant: RepositoryAgentGrant) {
  return {
    id: grant.id,
    clientName: grant.agentName,
    mode: grant.mode,
    branch: grant.branchOnly ? grant.branch : null,
    expiresAt: grant.expiresAt,
    revoked: Boolean(grant.revokedAt),
    needsPolicy: grant.needsPolicy,
    legacy: grant.legacy,
  };
}

routes.openapi(previewConsent, async (c) =>
  c.json(await previewMcpConsent(c, await getDB(), sessionUser(c)))
);
routes.openapi(decideConsent, async (c) =>
  c.json(await decideMcpConsent(c, await getDB(), sessionUser(c)))
);

routes.openapi(listChoices, async (c) => {
  sessionUser(c);
  issuerConfig();
  const clients = registeredClients().map((entry) => ({
    id: entry.client_id,
    name: entry.client_name,
  }));
  return c.json({ clients, repositories: await repositoryChoices(c, await getDB()) });
});

routes.openapi(saveSelection, async (c) => {
  const userId = sessionUser(c);
  issuerConfig();
  const input = z
    .object({ projectId: id, clientId: registeredClientId, branch: z.string().max(255).optional() })
    .parse(await c.req.json());
  const client = registeredClients().find((entry) => entry.client_id === input.clientId);
  if (!client) throw invalid('Unknown registered Agent.');
  const db = await getDB();
  const saved = await db.transaction(async (tx) => {
    await canDelegate(tx, userId, input.projectId);
    const branch = input.branch || (await findCurrentBranch(tx, input.projectId))?.name || 'main';
    if (!(await findBranchByName(tx, input.projectId, branch)))
      throw new AuthorizationError(404, 'Branch not found.');
    return createMcpPreselection(tx, { ...input, userId, branch });
  });
  const launch = client.connection_start_uri ? new URL(client.connection_start_uri) : null;
  launch?.searchParams.set('preselection', saved.id);
  return c.json({
    id: saved.id,
    expiresAt: saved.expiresAt.toISOString(),
    launchUrl: launch?.href ?? null,
  });
});

routes.openapi(listGrants, async (c) => {
  const userId = sessionUser(c);
  const projectId = id.parse(c.req.query('projectId'));
  const branch = id.optional().parse(c.req.query('branch'));
  const db = await getDB();
  const grants = await listRepositoryAgentDelegations(db, { userId, projectId, branch });
  return c.json({ grants: grants.map(presentGrant) });
});
routes.openapi(revokeGrant, async (c) => {
  const userId = sessionUser(c);
  const input = z.object({ id, projectId: id }).parse(await c.req.json());
  await revokeRepositoryAgentDelegation(await getDB(), { userId, ...input });
  return c.json({ revoked: true });
});
routes.openapi(editGrant, async (c) => {
  const userId = sessionUser(c);
  const body = await c.req.json();
  if (body?.repair === true) {
    const input = z.object({ projectId: id, id, branch: id }).parse(body);
    const repaired = await repairRepositoryAgentDelegation(await getDB(), { userId, ...input });
    return c.json({ grant: presentGrant(repaired) });
  }
  const { id: grantId, projectId, branch, mode, days } = updateSchema.parse(body);
  const db = await getDB();
  const existing = (await listRepositoryAgentDelegations(db, { projectId, userId })).find(
    (g) => g.id === grantId
  );
  if (!existing) throw new AuthorizationError(404, 'Delegation not found.');
  const updated = await updateRepositoryAgentDelegation(db, {
    userId,
    id: grantId,
    projectId,
    options: { branch: branch ?? existing.branch, branchOnly: branch !== null, mode, days },
  });
  return c.json({ grant: presentGrant(updated) });
});

routes.openapi(issuerMetadata, (c) => {
  const { issuer } = issuerConfig();
  return c.json({
    issuer: issuer.origin,
    authorization_endpoint: new URL('/settings/agent-access/authorize', issuer).href,
    token_endpoint: new URL('/api/mcp-oauth/token', issuer).href,
    grant_types_supported: ['authorization_code'],
    response_types_supported: ['code'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: delegationModes.map(scopeFor),
    authorization_response_iss_parameter_supported: true,
  });
});
routes.openapi(exchangeCode, async (c) => {
  const config = issuerConfig();
  if (c.req.header('content-type')?.split(';')[0]?.trim() !== 'application/x-www-form-urlencoded')
    return c.json({ error: 'invalid_request' }, 400);
  const form = new URLSearchParams(await c.req.text());
  checkParameters(form);
  if (form.get('grant_type') !== 'authorization_code')
    return c.json({ error: 'unsupported_grant_type' }, 400);
  const clientId = form.get('client_id');
  const redirectUri = form.get('redirect_uri');
  if (!clientId || !redirectUri) return c.json({ error: 'invalid_client' }, 400);
  try {
    registeredClient(clientId, redirectUri);
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 503)
      return c.json({ error: 'temporarily_unavailable' }, 503);
    return c.json({ error: 'invalid_client' }, 400);
  }
  const code = form.get('code') ?? '';
  const verifier = form.get('code_verifier') ?? '';
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(code) ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
    form.get('resource') !== config.resource.href
  )
    return c.json({ error: 'invalid_grant' }, 400);
  const db = await getDB();
  const result = await db.transaction(async (tx) => {
    const receipt = await redeemMcpAuthorizationCode(tx, {
      clientId,
      redirectUri,
      resource: config.resource.href,
      codeHash: digest(code),
      challenge: digest(verifier),
    });
    if (!receipt) return null;
    const key = openMcpAccessToken(
      receipt.encryptedCredential,
      't3x:authorization-code',
      codeSecret(code, config.secret)
    );
    const managed = await readAgentDelegation(tx, receipt.grantId, true);
    const grant = key && (await findApiKeyByValue(tx, key));
    if (!key || !grant || grant.id !== receipt.grantId || !grant.expires_at || !managed) {
      await recordMcpExchangeOutcome(tx, receipt.requestHash, 'spent_without_token');
      return null;
    }
    const expiresAt = Date.parse(grant.expires_at);
    await recordMcpExchangeOutcome(tx, receipt.requestHash, 'token_issued');
    return {
      access_token: sealMcpAccessToken(
        { audience: config.resource.href, expiresAt, apiKey: key },
        config.secret
      ),
      token_type: 'Bearer',
      expires_in: Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
      scope: scopeFor(managed.mode),
    };
  });
  return result ? c.json(result) : c.json({ error: 'invalid_grant' }, 400);
});
