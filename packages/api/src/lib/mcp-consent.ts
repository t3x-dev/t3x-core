import {
  type AnyDB,
  acquireTransitionPolicyBindingLock,
  claimMcpPreselection,
  decideMcpAuthorizationAttempt,
  findApiKeyById,
  findUserById,
  listMcpPreselections,
  lockAgentDelegation,
  lockCollaborationNamespace,
  lockMcpAuthorizationAttempt,
  pendingMcpApproval,
  storeMcpAuthorizationCode,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  AuthorizationError,
  approvalNonce,
  authorizationCode,
  authorizationRequest,
  callbackUrl,
  codeSecret,
  delegationModes,
  digest,
  issuerConfig,
  serviceMode,
  signConsentPreview,
  validConsentPreview,
} from './mcp-authorization';
import {
  consentTerms,
  delegationDays,
  repositoryChoices,
  selectionForRequest,
} from './mcp-consent-preview';
import { sealMcpAccessToken } from './mcp-oauth';
import { issueRepositoryAgentDelegation } from './repository-agent-delegation';

function readRequest(c: Context, userId: string) {
  const params = new URL(c.req.url).searchParams;
  params.delete('task');
  const config = issuerConfig();
  const request = authorizationRequest(params, config);
  const identity = {
    issuer: config.issuer.origin,
    resource: config.resource.href,
    clientId: request.client.client_id,
    redirectUri: request.redirectUri,
    challenge: request.challenge,
  };
  const requestTermsHash = digest(
    JSON.stringify([
      request.state,
      request.mode,
      request.repository,
      request.branch,
      request.preselection,
    ])
  );
  return { config, params, request, attemptKey: { userId, identity, requestTermsHash } };
}

const stale = () =>
  new AuthorizationError(409, 'This authorization has changed. Review the current request again.');
type AttemptLookup = Awaited<ReturnType<typeof lockMcpAuthorizationAttempt>>;
function checkLookup(attempt: AttemptLookup) {
  if (attempt.status === 'limited')
    throw new AuthorizationError(429, 'Please wait before opening another authorization request.');
  if (attempt.status === 'unavailable')
    throw new AuthorizationError(404, 'Authorization request unavailable.');
  if (attempt.status === 'conflict') throw stale();
  return attempt;
}

export async function previewMcpConsent(c: Context, db: AnyDB, userId: string) {
  const { config, params, request, attemptKey } = readRequest(c, userId);
  const account = await findUserById(db, userId);
  const base = {
    clientName: request.client.client_name,
    account: {
      id: userId,
      name: account?.username
        ? '@' + account.username
        : account?.name
          ? `${account.name} (${userId})`
          : userId,
    },
    repositoryLocked: false,
    repositories: [],
    selected: null,
    scope: request.mode,
    mode: request.mode,
    days: 7 as const,
    branchOnly: false,
    priorGrant: null,
    preselections: [],
    previewVersion: null,
  };
  const attempt = await db.transaction(async (tx) => {
    const existing = checkLookup(
      await lockMcpAuthorizationAttempt(tx, { ...attemptKey, create: false })
    );
    if (existing.status !== 'missing') return existing;
    // Validate an explicitly nominated target and returned handoff before assigning the attempt.
    await selectionForRequest(tx, userId, request, params);
    return checkLookup(await lockMcpAuthorizationAttempt(tx, { ...attemptKey, create: true }));
  });
  if (attempt.status === 'pending' && 'id' in attempt) {
    const selection = await selectionForRequest(db, userId, request, params);
    const { hash, ...terms } = await consentTerms(
      db,
      userId,
      request,
      params,
      await serviceMode(config),
      selection
    );
    const repositoryLocked = Boolean(request.repository || selection.saved);
    const repositories =
      repositoryLocked && terms.selected
        ? [{ id: terms.selected.id, name: terms.selected.name }]
        : await repositoryChoices(c, db);
    const byId = new Map(repositories.map((repository) => [repository.id, repository.name]));
    const available = await listMcpPreselections(db, userId, request.client.client_id);
    const preselections = available.flatMap((saved) => {
      const repository = byId.get(saved.projectId);
      if (!repository || (request.branch !== null && saved.branch !== request.branch)) return [];
      return [{ id: saved.id, projectId: saved.projectId, repository, branch: saved.branch }];
    });
    return {
      ...base,
      ...terms,
      status: attempt.status,
      repositoryLocked,
      repositories,
      preselections,
      previewVersion: signConsentPreview(attempt.id, userId, hash, config.secret),
    };
  }
  if (attempt.status === 'closed' || 'id' in attempt) return { ...base, status: attempt.status };
  throw stale();
}

const decisionBody = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('cancel'), previewVersion: z.string().max(128) }),
  z.object({
    decision: z.literal('approve'),
    previewVersion: z.string().max(128),
    projectId: z.string().min(1).max(255),
    branch: z.string().min(1).max(255),
    branchOnly: z.boolean(),
    mode: z.enum(delegationModes),
    days: delegationDays,
  }),
]);

export async function decideMcpConsent(c: Context, db: AnyDB, userId: string) {
  const { config, params, request, attemptKey } = readRequest(c, userId);
  const raw = await c.req.json();
  if (typeof raw?.previewVersion !== 'string') throw stale();
  const body = decisionBody.parse(raw);
  const approvalHash = digest(JSON.stringify(body));
  // Only fresh approvals need deployment readiness. A terminal receipt remains usable during an outage.
  const initial = await db.transaction(async (tx) =>
    checkLookup(await lockMcpAuthorizationAttempt(tx, { ...attemptKey, create: false }))
  );
  const deployment =
    initial.status === 'pending' && body.decision === 'approve' ? await serviceMode(config) : null;
  return db.transaction(async (tx) => {
    const attempt = checkLookup(
      await lockMcpAuthorizationAttempt(tx, { ...attemptKey, create: false })
    );
    if (
      !('id' in attempt) ||
      !validConsentPreview(body.previewVersion, attempt.id, userId, config.secret)
    )
      throw stale();
    if (body.decision === 'cancel') {
      if (
        attempt.status !== 'cancelled' &&
        (attempt.status !== 'pending' ||
          !(await decideMcpAuthorizationAttempt(tx, attempt.id, 'cancelled', null)))
      )
        throw stale();
      return { redirectTo: callbackUrl(request, config.issuer.origin, { error: 'access_denied' }) };
    }
    if (attempt.status === 'approved' && attempt.approvalHash === approvalHash) {
      const prior = await pendingMcpApproval(tx, attempt.id);
      const grant = prior && (await findApiKeyById(tx, prior.grantId));
      if (
        !prior ||
        prior.approvalHash !== approvalHash ||
        prior.redeemed ||
        !grant ||
        grant.revoked_at ||
        !grant.expires_at ||
        Date.parse(grant.expires_at) <= Date.now()
      )
        throw stale();
      return {
        redirectTo: callbackUrl(request, config.issuer.origin, {
          code: authorizationCode(prior.nonce, config.secret),
        }),
      };
    }
    if (attempt.status !== 'pending' || !deployment) throw stale();
    const selection = await selectionForRequest(tx, userId, request, params);
    if (selection.project?.projectId !== body.projectId || selection.branch !== body.branch)
      throw stale();
    await lockAgentDelegation(tx, body.projectId, userId, request.client.client_id);
    // Membership and guest-grant changes take this same namespace lock.
    if (!selection.project.namespaceId) throw stale();
    await lockCollaborationNamespace(tx, selection.project.namespaceId);
    await acquireTransitionPolicyBindingLock(tx, body.projectId, body.branch);
    const checked = await selectionForRequest(tx, userId, request, params);
    if (
      checked.project?.namespaceId !== selection.project.namespaceId ||
      checked.branch !== body.branch
    )
      throw stale();
    const terms = await consentTerms(tx, userId, request, params, deployment, checked);
    if (
      body.previewVersion !== signConsentPreview(attempt.id, userId, terms.hash, config.secret) ||
      body.mode !== terms.mode ||
      body.branchOnly !== terms.branchOnly ||
      body.days !== terms.days
    )
      throw stale();
    if (!(await decideMcpAuthorizationAttempt(tx, attempt.id, 'approved', approvalHash)))
      throw stale();
    if (
      selection.saved &&
      !(await claimMcpPreselection(tx, {
        id: selection.saved.id,
        userId,
        projectId: body.projectId,
        branch: body.branch,
        clientId: request.client.client_id,
        attemptId: attempt.id,
      }))
    )
      throw stale();
    const { grant, credential } = await issueRepositoryAgentDelegation(tx, {
      projectId: body.projectId,
      userId,
      clientId: request.client.client_id,
      agentName: request.client.client_name,
      options: {
        branch: body.branch,
        branchOnly: body.branchOnly,
        mode: body.mode,
        days: body.days,
      },
    });
    const nonce = approvalNonce();
    const code = authorizationCode(nonce, config.secret);
    const expiresAt = new Date(Date.now() + 300_000);
    const encryptedCredential = sealMcpAccessToken(
      { audience: 't3x:authorization-code', apiKey: credential, expiresAt: expiresAt.getTime() },
      codeSecret(code, config.secret)
    );
    await storeMcpAuthorizationCode(tx, {
      codeHash: digest(code),
      requestHash: attempt.id,
      approvalHash,
      nonce,
      clientId: request.client.client_id,
      redirectUri: request.redirectUri,
      resource: config.resource.href,
      challenge: request.challenge,
      grantId: grant.id,
      mode: body.mode,
      encryptedCredential,
      expiresAt,
    });
    return { redirectTo: callbackUrl(request, config.issuer.origin, { code }) };
  });
}
