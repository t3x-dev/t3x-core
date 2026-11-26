import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type AnyDB,
  findApiKeyById,
  findApiKeyByValue,
  findBranchByName,
  findCurrentBranch,
  findProjects,
  getRepositoryAddress,
  getRepositoryAddresses,
  pendingMcpApproval,
  redeemMcpAuthorizationCode,
  resolveRepositoryProject,
  storeMcpAuthorizationCode,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getDB } from '../lib/db';
import {
  AuthorizationError,
  approvalNonce,
  authorizationCode,
  authorizationRequest,
  callbackUrl,
  checkParameters,
  codeSecret,
  delegationModes,
  digest,
  issuerConfig,
  registeredClient,
  scopeAllows,
  scopeFor,
  serviceMode,
} from '../lib/mcp-authorization';
import { openMcpAccessToken, sealMcpAccessToken } from '../lib/mcp-oauth';
import { contentSchemaReadiness } from '../lib/open-workspace';
import { evaluateProjectAccess, getProjectListAuthority } from '../lib/project-access';
import {
  issueRepositoryAgentDelegation,
  listRepositoryAgentDelegations,
  previewRepositoryAgentDelegation,
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
const allowedDays = z.union([z.literal(1), z.literal(7), z.literal(30)]);
const optionsSchema = z.object({
  projectId: id,
  branch: id,
  branchOnly: z.boolean(),
  mode: z.enum(delegationModes),
  days: allowedDays,
});
const updateSchema = z.object({
  projectId: id,
  id,
  branch: id.nullable(),
  mode: z.enum(delegationModes),
  days: allowedDays,
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
  task: z.string().optional(),
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

for (const path of [base, consent, publicBase + '/*'])
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

async function canDelegate(db: AnyDB, userId: string, projectId: string) {
  const result = await evaluateProjectAccess(
    db,
    projectId,
    { userId, principalKind: 'human', projectId: null },
    'project:guests:manage'
  );
  if (!result.allowed) throw new AuthorizationError(404, 'Repository unavailable for delegation.');
  return result.project;
}

async function resolveSelection(
  db: AnyDB,
  userId: string,
  repository: string | null,
  projectId: string | null
) {
  if (repository !== null) {
    const parts = repository.split('/');
    if (parts.length !== 2 || parts.some((part) => !part.trim()))
      throw invalid('Use a repository address in owner/name format.');
    const named = await resolveRepositoryProject(db, parts[0], parts[1]);
    if (!named || (projectId && projectId !== named.projectId))
      throw new AuthorizationError(404, 'Repository unavailable for delegation.');
    return canDelegate(db, userId, named.projectId);
  }
  return projectId ? canDelegate(db, userId, projectId) : null;
}

async function repositoryChoices(c: Context, db: AnyDB) {
  const authority = getProjectListAuthority(c);
  if (!authority) return [];
  const repositories: { id: string; name: string }[] = [];
  let cursor: string | null = '';
  do {
    const page: { items: { projectId: string; name: string }[]; next_cursor: string | null } =
      await findProjects(db, {
        authority,
        required_action: 'project:guests:manage',
        cursor,
        limit: 100,
      });
    const addresses = await getRepositoryAddresses(
      db,
      page.items.map((p) => p.projectId)
    );
    repositories.push(
      ...page.items.map((p) => ({
        id: p.projectId,
        name: addresses.get(p.projectId)?.canonical_path?.slice(1) ?? p.name,
      }))
    );
    cursor = page.next_cursor;
  } while (cursor);
  return repositories;
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

routes.openapi(previewConsent, async (c) => {
  const userId = sessionUser(c);
  const config = issuerConfig();
  const params = new URL(c.req.url).searchParams;
  const request = authorizationRequest(params, config);
  const db = await getDB();
  const project = await resolveSelection(db, userId, request.repository, params.get('projectId'));
  const deployment = await serviceMode(config);
  const scope = scopeAllows(deployment, request.mode) ? request.mode : deployment;
  let selected = null;
  if (project) {
    const branch =
      request.branch || (await findCurrentBranch(db, project.projectId))?.name || 'main';
    const target = await findBranchByName(db, project.projectId, branch);
    if (!target) throw new AuthorizationError(404, 'Branch not found.');
    const effective = await previewRepositoryAgentDelegation(db, {
      projectId: project.projectId,
      options: { branch, branchOnly: false, days: 7, mode: scope },
    });
    const address = await getRepositoryAddress(db, project);
    let outcome: string;
    let detail: string;
    if (scope === 'read') {
      outcome = 'read_only';
      detail =
        deployment === 'read'
          ? 'This MCP connection can read repository content and history. Its editing tools are unavailable.'
          : 'The requested access covers reading content and history.';
    } else if (effective.outcome === 'missing-policy') {
      outcome = 'draft_only';
      detail =
        'The Agent can save a draft. A repository administrator must configure a branch acceptance policy before the Agent can prepare a fixed Review.';
    } else if (effective.outcome === 'commit' && scope === 'commit') {
      outcome = 'eligible';
      detail =
        'The Agent can prepare a fixed Review and commit its eligible changes after checks pass.';
    } else {
      outcome = 'protected';
      detail =
        scope === 'prepare'
          ? 'The Agent can prepare changes for your review. A person must decide before commit.'
          : 'This branch keeps its existing acceptance rules. The Agent can prepare a Review. An eligible reviewer must approve before commit.';
    }
    let readinessDetail: string | undefined;
    if (scope !== 'read') {
      const schema = await contentSchemaReadiness(
        db,
        project.projectId,
        { kind: 'human', id: userId },
        branch,
        target.headCommitHash
      );
      if (schema === 'unbound')
        readinessDetail =
          'The Agent can collect sources now. Choose a Schema before its first content commit.';
      if (schema === 'first-schema')
        readinessDetail =
          'This Workspace has a selected Schema. Its first Schema needs your approval.';
      if (schema === 'unresolved')
        readinessDetail = 'The Workspace Schema needs attention before content can be verified.';
    }
    selected = {
      id: project.projectId,
      name: address.canonical_path?.slice(1) ?? project.name,
      branch,
      outcome,
      detail,
      ...(readinessDetail && { readinessDetail }),
    };
  }
  const repositories =
    request.repository && selected
      ? [{ id: selected.id, name: selected.name }]
      : await repositoryChoices(c, db);
  return c.json({
    clientName: request.client.client_name,
    repositories,
    selected,
    scope,
    repositoryLocked: request.repository !== null,
    task: params.get('task') ?? undefined,
  });
});

routes.openapi(decideConsent, async (c) => {
  const userId = sessionUser(c);
  const config = issuerConfig();
  const request = authorizationRequest(new URL(c.req.url).searchParams, config);
  const body = await c.req.json();
  if (body?.decision === 'cancel')
    return c.json({
      redirectTo: callbackUrl(request, config.issuer.origin, { error: 'access_denied' }),
    });
  if (body?.decision !== 'approve') throw invalid('Confirm or cancel the request.');
  const { projectId, ...options } = optionsSchema.parse(body);
  if (
    !scopeAllows(request.mode, options.mode) ||
    (request.branch && request.branch !== options.branch)
  )
    throw invalid('Selection exceeds this authorization request.');
  const db = await getDB();
  await resolveSelection(db, userId, request.repository, projectId);
  const deployment = await serviceMode(config);
  if (!scopeAllows(deployment, options.mode))
    throw new AuthorizationError(409, 'The available MCP tools changed. Review the request again.');
  const requestHash = digest(
    JSON.stringify([
      userId,
      request.client.client_id,
      config.resource.href,
      request.redirectUri,
      request.challenge,
    ])
  );
  const approvalHash = digest(
    JSON.stringify([
      projectId,
      options.branch,
      options.branchOnly,
      options.mode,
      options.days,
      request.state,
    ])
  );
  const code = await db.transaction(async (tx) => {
    const earlier = await pendingMcpApproval(tx, requestHash);
    if (earlier) {
      const grant = await findApiKeyById(tx, earlier.grantId);
      if (earlier.approvalHash !== approvalHash || earlier.redeemed || !grant || grant.revoked_at)
        throw new AuthorizationError(
          409,
          'This request has already been handled. Start a new request from your chat.'
        );
      return authorizationCode(earlier.nonce, config.secret);
    }
    const nonce = approvalNonce();
    const code = authorizationCode(nonce, config.secret);
    const { grant, credential } = await issueRepositoryAgentDelegation(tx, {
      projectId,
      userId,
      clientId: request.client.client_id,
      agentName: request.client.client_name,
      options,
    });
    const expiresAt = new Date(Date.now() + 300_000);
    const encryptedCredential = sealMcpAccessToken(
      { audience: 't3x:authorization-code', apiKey: credential, expiresAt: expiresAt.getTime() },
      codeSecret(code, config.secret)
    );
    await storeMcpAuthorizationCode(tx, {
      codeHash: digest(code),
      requestHash,
      approvalHash,
      nonce,
      clientId: request.client.client_id,
      redirectUri: request.redirectUri,
      resource: config.resource.href,
      challenge: request.challenge,
      grantId: grant.id,
      mode: options.mode,
      encryptedCredential,
      expiresAt,
    });
    return code;
  });
  return c.json({ redirectTo: callbackUrl(request, config.issuer.origin, { code }) });
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
    const grant = key && (await findApiKeyByValue(tx, key));
    if (!key || !grant || grant.id !== receipt.grantId || !grant.expires_at) return null;
    const expiresAt = Date.parse(grant.expires_at);
    return {
      access_token: sealMcpAccessToken(
        { audience: config.resource.href, expiresAt, apiKey: key },
        config.secret
      ),
      token_type: 'Bearer',
      expires_in: Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
      scope: scopeFor(z.enum(delegationModes).parse(receipt.mode)),
    };
  });
  return result ? c.json(result) : c.json({ error: 'invalid_grant' }, 400);
});
