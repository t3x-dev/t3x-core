import {
  type ApiKey,
  type ApiKeyPrincipalKind,
  isTransitionScope,
  type TransitionScope,
} from '@t3x-dev/core';
import {
  type AnyDB,
  getTransitionPolicyBinding,
  type TransitionPolicyBinding,
} from '@t3x-dev/storage';

export type TrustedTransitionPrincipal = {
  actor: { kind: ApiKeyPrincipalKind; id: string };
  keyId: string | null;
  projectId: string | null;
  scopes: readonly TransitionScope[];
};

export class TransitionScopeDeniedError extends Error {
  readonly code = 'TRANSITION_SCOPE_DENIED';

  constructor(readonly scope: TransitionScope) {
    super(`Credential does not grant ${scope}`);
    this.name = 'TransitionScopeDeniedError';
  }
}

export class TransitionProjectScopeDeniedError extends Error {
  readonly code = 'TRANSITION_PROJECT_SCOPE_DENIED';

  constructor(readonly projectId: string) {
    super(`Credential is not authorized for project ${projectId}`);
    this.name = 'TransitionProjectScopeDeniedError';
  }
}

export class TransitionPolicyBindingRequiredError extends Error {
  readonly code = 'TRANSITION_POLICY_BINDING_REQUIRED';

  constructor(
    readonly projectId: string,
    readonly refName: string
  ) {
    super(`No server-selected AcceptancePolicy is bound to ${projectId}/${refName}`);
    this.name = 'TransitionPolicyBindingRequiredError';
  }
}

const POLICY_BOUND_SCOPES: ReadonlySet<TransitionScope> = new Set([
  'transition:decide:accept',
  'transition:decide:override',
  'transition:decide:reject',
  'transition:commit:create',
  'transition:ref:advance',
]);

/**
 * Derive the Transition actor only from authenticated server context. Request
 * payloads must never be accepted as an input to this function.
 */
export function deriveTrustedTransitionPrincipal(
  apiKey: ApiKey | undefined
): TrustedTransitionPrincipal {
  if (apiKey === undefined) {
    return {
      actor: { kind: 'human', id: 'human:local-user' },
      keyId: null,
      projectId: null,
      scopes: [],
    };
  }

  const scopes = apiKey.transition_scopes;
  if (!scopes.every(isTransitionScope)) {
    throw new TransitionScopeDeniedError('transition:inspect');
  }
  return {
    actor: {
      kind: apiKey.principal_kind,
      id:
        apiKey.principal_kind === 'human' && apiKey.user_id
          ? `user:${apiKey.user_id}`
          : `${apiKey.principal_kind}:api-key:${apiKey.id}`,
    },
    keyId: apiKey.id,
    projectId: apiKey.project_id,
    scopes,
  };
}

/**
 * Authorize one Transition operation. Missing auth context is allowed only for
 * the existing AUTH_DISABLED local mode; authenticated credentials require an
 * explicit scope and may never escape their project binding.
 */
export function requireTransitionAuthority(input: {
  apiKey: ApiKey | undefined;
  projectId: string;
  scope: TransitionScope;
}): TrustedTransitionPrincipal {
  const principal = deriveTrustedTransitionPrincipal(input.apiKey);
  if (principal.keyId === null) return principal;
  if (!principal.scopes.includes(input.scope)) {
    throw new TransitionScopeDeniedError(input.scope);
  }
  if (principal.projectId !== null && principal.projectId !== input.projectId) {
    throw new TransitionProjectScopeDeniedError(input.projectId);
  }
  return principal;
}

/**
 * Resolve authority and policy from server state. Non-human Decision/Commit
 * paths fail closed when no project/ref policy has been configured.
 */
export async function resolveTransitionControlPlane(input: {
  db: AnyDB;
  apiKey: ApiKey | undefined;
  projectId: string;
  refName: string;
  scope: TransitionScope;
}): Promise<{
  principal: TrustedTransitionPrincipal;
  policyBinding: TransitionPolicyBinding | null;
}> {
  const principal = requireTransitionAuthority(input);
  const policyBinding = await getTransitionPolicyBinding(input.db, input.projectId, input.refName);
  if (
    principal.actor.kind !== 'human' &&
    POLICY_BOUND_SCOPES.has(input.scope) &&
    policyBinding === null
  ) {
    throw new TransitionPolicyBindingRequiredError(input.projectId, input.refName);
  }
  return { principal, policyBinding };
}
