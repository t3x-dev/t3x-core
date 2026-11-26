import { randomBytes } from 'node:crypto';
import { API_KEY_VALUE_PREFIX, type ApiKey, type TransitionScope } from '@t3x-dev/core';
import {
  type AnyDB,
  adjustAgentDelegation,
  createApiKey,
  type DelegationOptions,
  findApiKeyById,
  findBranchByName,
  findNamespaceById,
  findProjectById,
  getTransitionPolicyBinding,
  listApiKeys,
  lockAgentDelegation,
  readAgentDelegation,
  recordAgentDelegation,
  revokeApiKey,
  selectAgentDelegations,
  type TransitionPolicyBinding,
} from '@t3x-dev/storage';
import { evaluateProjectAccess } from './project-access';
import { UNPROTECTED_REF_POLICY } from './transition-control-plane/applicable-policy';

export type { DelegationMode, DelegationOptions } from '@t3x-dev/storage';
export class RepositoryDelegationError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string
  ) {
    super(message);
  }
}
type Owner = { projectId: string; userId: string };
type Stored = NonNullable<Awaited<ReturnType<typeof readAgentDelegation>>>;
export interface RepositoryAgentGrant {
  id: string;
  projectId: string;
  clientId: string;
  agentName: string;
  branch: string;
  branchOnly: boolean;
  mode: DelegationOptions['mode'];
  expiresAt: string | null;
  revokedAt: string | null;
  legacy: boolean;
  needsPolicy?: boolean;
}
function asGrant(row: Stored): RepositoryAgentGrant {
  if (!row.projectId) throw new RepositoryDelegationError(409, 'Invalid stored delegation');
  return {
    id: row.id,
    legacy: !isRepositoryDelegationKey(row.id),
    projectId: row.projectId,
    clientId: row.clientId,
    agentName: row.agentName,
    branch: row.branch,
    branchOnly: row.branchOnly,
    mode: row.mode,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}
function expiry(days: number) {
  return new Date(Date.now() + days * 86_400_000);
}
function scopes(mode: DelegationOptions['mode']): TransitionScope[] {
  const allowed: TransitionScope[] = ['transition:inspect'];
  if (mode !== 'read') allowed.push('transition:propose', 'transition:verify');
  if (mode === 'commit')
    allowed.push(
      'transition:decide:accept',
      'transition:decide:reject',
      'transition:commit:create',
      'transition:ref:advance'
    );
  return allowed;
}
async function requireAdmin(db: AnyDB, input: Owner) {
  const access = await evaluateProjectAccess(
    db,
    input.projectId,
    { userId: input.userId, projectId: null, principalKind: 'human' },
    'project:guests:manage'
  );
  if (!access.allowed)
    throw new RepositoryDelegationError(access.status, 'Repository delegation is unavailable');
}
async function personal(db: AnyDB, projectId: string) {
  const project = await findProjectById(db, projectId);
  if (!project?.namespaceId) return false;
  const namespace = await findNamespaceById(db, project.namespaceId);
  return namespace?.kind === 'personal';
}
export async function previewRepositoryAgentDelegation(
  db: AnyDB,
  { projectId, options }: { projectId: string; options: DelegationOptions }
): Promise<{
  branch: string;
  outcome: 'read' | 'review' | 'commit' | 'policy-restricted' | 'missing-policy';
}> {
  if (
    !['read', 'prepare', 'commit'].includes(options.mode) ||
    ![1, 7, 30].includes(options.days) ||
    !options.branch.trim() ||
    typeof options.branchOnly !== 'boolean'
  )
    throw new RepositoryDelegationError(400, 'Invalid delegation options');
  if (!(await findBranchByName(db, projectId, options.branch)))
    throw new RepositoryDelegationError(404, 'Branch not found');
  const branch = options.branch;
  if (options.mode === 'read') return { branch, outcome: 'read' };
  const binding = await getTransitionPolicyBinding(db, projectId, branch);
  if (binding) {
    if (!binding.policy.authorization.allowSelfApproval || options.mode === 'prepare')
      return { branch, outcome: 'review' };
    if (binding.policy.authorization.decide.actors.mode !== 'any')
      return { branch, outcome: 'policy-restricted' };
  } else if (!(await personal(db, projectId))) return { branch, outcome: 'missing-policy' };
  return { branch, outcome: options.mode === 'prepare' ? 'review' : 'commit' };
}
export async function issueRepositoryAgentDelegation(
  db: AnyDB,
  input: Owner & { clientId: string; agentName: string; options: DelegationOptions }
) {
  return db.transaction(async (t) => {
    const tx = t as AnyDB;
    await requireAdmin(tx, input);
    await previewRepositoryAgentDelegation(tx, input);
    await lockAgentDelegation(tx, input.projectId, input.userId, input.clientId);
    for (const prior of await selectAgentDelegations(tx, input.projectId, input.userId)) {
      if (!prior.revokedAt && prior.clientId === input.clientId)
        await revokeApiKey(tx, prior.id, 'rotated');
    }
    const credential = API_KEY_VALUE_PREFIX + randomBytes(32).toString('base64url');
    const key = await createApiKey(tx, {
      name: input.agentName,
      projectId: input.projectId,
      userId: input.userId,
      delegatorUserId: input.userId,
      principalKind: 'agent',
      credentialKind: 'mcp',
      keyValue: credential,
      expiresAt: expiry(input.options.days),
      transitionScopes: scopes(input.options.mode),
      machineGrantRole: input.options.mode === 'read' ? 'viewer' : 'editor',
      repositoryDelegation: true,
    });
    await recordAgentDelegation(tx, key.id, input.clientId, input.options);
    const grant = await readAgentDelegation(tx, key.id);
    if (!grant) throw new RepositoryDelegationError(409, 'Delegation could not be recorded');
    if (!grant.expiresAt) throw new RepositoryDelegationError(409, 'Missing credential expiry');
    return { credential, grant: { ...asGrant(grant), expiresAt: grant.expiresAt.toISOString() } };
  });
}
export async function listRepositoryAgentDelegations(
  db: AnyDB,
  input: Owner & { branch?: string }
) {
  await requireAdmin(db, input);
  const managed = (await selectAgentDelegations(db, input.projectId, input.userId)).map(asGrant);
  const ids = new Set(managed.map((grant) => grant.id));
  const keys = (await listApiKeys(db, input)).filter(
    (key) => !ids.has(key.id) && ownedManualAgent(key, input)
  );
  if (!keys.length) return managed;
  const branch = input.branch ?? 'main';
  const needsPersonalPolicy =
    (await personal(db, input.projectId)) &&
    Boolean(await findBranchByName(db, input.projectId, branch)) &&
    !(await getTransitionPolicyBinding(db, input.projectId, branch));
  return managed.concat(
    keys.map((key) => ({
      id: key.id,
      legacy: true,
      projectId: input.projectId,
      agentName: key.name,
      clientId: legacyClient(key.id),
      branch,
      mode: legacyMode(key),
      branchOnly: false,
      expiresAt: key.expires_at ?? null,
      revokedAt: null,
      needsPolicy: needsPersonalPolicy && repairable(key, input),
    }))
  );
}
const legacyClient = (keyId: string) => `legacy-key:${keyId}`;
function legacyMode(key: ApiKey): DelegationOptions['mode'] {
  const includes = (scope: TransitionScope) => key.transition_scopes.includes(scope);
  if (!scopes('prepare').every(includes)) return 'read';
  return scopes('commit')
    .filter((s) => s !== 'transition:decide:reject')
    .every(includes)
    ? 'commit'
    : 'prepare';
}
function ownedManualAgent(key: ApiKey | null, input: Owner): key is ApiKey {
  return (
    key !== null &&
    !isRepositoryDelegationKey(key.id) &&
    key.principal_kind === 'agent' &&
    ['mcp', 'agent'].includes(key.credential_kind ?? '') &&
    key.project_id === input.projectId &&
    key.user_id === input.userId &&
    key.delegator_user_id === input.userId
  );
}
function repairable(key: ApiKey | null, input: Owner): key is ApiKey {
  return (
    ownedManualAgent(key, input) &&
    !key.revoked_at &&
    (!key.expires_at || Date.parse(key.expires_at) > Date.now()) &&
    legacyMode(key) !== 'read'
  );
}
export async function repairRepositoryAgentDelegation(
  db: AnyDB,
  input: Owner & { id: string; branch: string }
): Promise<RepositoryAgentGrant> {
  return db.transaction(async (t) => {
    const tx = t as AnyDB;
    await requireAdmin(tx, input);
    const clientId = legacyClient(input.id);
    await lockAgentDelegation(tx, input.projectId, input.userId, clientId);
    const key = await findApiKeyById(tx, input.id);
    if (!repairable(key, input))
      throw new RepositoryDelegationError(404, 'No eligible Agent credential');
    const current = await readAgentDelegation(tx, input.id);
    if (current?.clientId === clientId && current.branch === input.branch) return asGrant(current);
    if (
      current ||
      !(await personal(tx, input.projectId)) ||
      (await getTransitionPolicyBinding(tx, input.projectId, input.branch))
    )
      throw new RepositoryDelegationError(
        409,
        'This branch already has its own policy or is ineligible for personal delegation'
      );
    const options = { branch: input.branch, branchOnly: true, mode: legacyMode(key), days: 7 };
    await previewRepositoryAgentDelegation(tx, { ...input, options });
    await recordAgentDelegation(tx, key.id, clientId, options);
    const grant = await readAgentDelegation(tx, key.id);
    if (!grant) throw new RepositoryDelegationError(409, 'Delegation could not be recorded');
    return asGrant(grant);
  });
}
async function lockOwned(db: AnyDB, input: Owner & { id: string }, includeManual = false) {
  await requireAdmin(db, input);
  const grant = await readAgentDelegation(db, input.id);
  if (!grant && includeManual && ownedManualAgent(await findApiKeyById(db, input.id), input)) {
    await lockAgentDelegation(db, input.projectId, input.userId, legacyClient(input.id));
    return;
  }
  if (!grant || grant.projectId !== input.projectId || grant.userId !== input.userId)
    throw new RepositoryDelegationError(404, 'Delegation not found');
  await lockAgentDelegation(db, input.projectId, input.userId, grant.clientId);
}
export async function revokeRepositoryAgentDelegation(
  db: AnyDB,
  input: Owner & { id: string }
): Promise<void> {
  await db.transaction(async (t) => {
    const tx = t as AnyDB;
    await lockOwned(tx, input, true);
    await revokeApiKey(tx, input.id, 'manual');
  });
}
export async function updateRepositoryAgentDelegation(
  db: AnyDB,
  input: Owner & { id: string; options: DelegationOptions }
): Promise<RepositoryAgentGrant> {
  return db.transaction(async (t) => {
    const tx = t as AnyDB;
    await lockOwned(tx, input);
    if (!isRepositoryDelegationKey(input.id))
      throw new RepositoryDelegationError(
        409,
        'Create a new authorization to change this legacy credential'
      );
    await previewRepositoryAgentDelegation(tx, input);
    const current = await readAgentDelegation(tx, input.id, true);
    if (!current || current.revokedAt)
      throw new RepositoryDelegationError(409, 'Revoked access requires a new authorization');
    const existingScopes = scopes(current.mode);
    if (
      scopes(input.options.mode).some((scope) => !existingScopes.includes(scope)) ||
      (current.branchOnly && (!input.options.branchOnly || input.options.branch !== current.branch))
    ) {
      throw new RepositoryDelegationError(
        409,
        'Request new access from the Agent chat to expand this delegation'
      );
    }
    if (
      !(await adjustAgentDelegation(
        tx,
        input.id,
        input.projectId,
        input.options,
        expiry(input.options.days),
        scopes(input.options.mode)
      ))
    )
      throw new RepositoryDelegationError(409, 'Revoked access requires a new authorization');
    const grant = await readAgentDelegation(tx, input.id);
    if (!grant) throw new RepositoryDelegationError(404, 'Delegation not found');
    return asGrant(grant);
  });
}
export function isRepositoryDelegationKey(id: string) {
  return id.startsWith('ak_dlg_');
}
export function delegatedActorKey(actor: { kind: string; id: string } | undefined) {
  if (actor?.kind !== 'agent') return null;
  const prefix = 'agent:api-key:';
  const id = actor.id.startsWith(prefix) ? actor.id.slice(prefix.length) : '';
  return id || null;
}
export function activeGrant(grant: Stored | null): grant is Stored {
  return (
    grant !== null &&
    grant.revokedAt === null &&
    (grant.expiresAt === null || grant.expiresAt.getTime() > Date.now())
  );
}
/** An authenticated delegation supplies a policy only to its recipient on eligible personal refs. */
export async function delegatedRefPolicy(
  db: AnyDB,
  projectId: string,
  refName: string,
  actor: { kind: string; id: string } | undefined,
  binding: TransitionPolicyBinding | null,
  lock = false,
  requiredMode: 'prepare' | 'commit' = 'prepare'
): Promise<TransitionPolicyBinding | null> {
  const key = delegatedActorKey(actor);
  if (!key) return binding;
  const grant = await readAgentDelegation(db, key, lock);
  if (grant === null && !isRepositoryDelegationKey(key)) return binding;
  if (
    !activeGrant(grant) ||
    grant.projectId !== projectId ||
    grant.mode === 'read' ||
    (requiredMode === 'commit' && grant.mode !== 'commit') ||
    (grant.branchOnly && grant.branch !== refName)
  )
    return null;
  if (binding) return binding;
  if (!(await personal(db, projectId))) return null;
  return {
    ...UNPROTECTED_REF_POLICY,
    projectId,
    refName,
    updatedAt: grant.createdAt.toISOString(),
    updatedBy: { kind: 'human', id: `user:${grant.userId}` },
  };
}
