import type { RequestPrincipal } from '@t3x-dev/application';
import type { ApiKeyPrincipalKind, Author, TransitionScope } from '@t3x-dev/core';
import {
  type AnyDB,
  getTransitionPolicyBinding,
  type TransitionPolicyBinding,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { getRequestPrincipal } from './request-principal';

export type TrustedTransitionPrincipal = {
  actor: {
    kind: ApiKeyPrincipalKind;
    id: string;
    delegator?: { kind: 'human'; id: string };
  };
  keyId: string | null;
  projectId: string | null;
  scopes: readonly TransitionScope[];
};

/** Read authentication middleware state through Hono's shared context contract. */
export function transitionApiKey(c: Context): RequestPrincipal | undefined {
  return getRequestPrincipal(c);
}

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
  requestPrincipal: RequestPrincipal | undefined
): TrustedTransitionPrincipal {
  if (requestPrincipal === undefined) {
    return {
      actor: { kind: 'human', id: 'human:local-user' },
      keyId: null,
      projectId: null,
      scopes: [],
    };
  }

  const scopes = requestPrincipal.scopes;
  return {
    actor: {
      ...requestPrincipal.actor,
      ...(requestPrincipal.delegator ? { delegator: requestPrincipal.delegator } : {}),
    },
    keyId: requestPrincipal.credential.id,
    projectId: requestPrincipal.credential.projectId,
    scopes,
  };
}

/** Keep legacy merge projections compatible without trusting request-shaped machine authors. */
export function toTrustedTransitionAuthor(
  principal: TrustedTransitionPrincipal,
  humanFallback: Author
): Author {
  if (principal.actor.kind === 'human') return humanFallback;
  return {
    type: principal.actor.kind === 'service' ? 'system' : 'agent',
    id: principal.actor.id,
    name: principal.actor.id,
  };
}

/**
 * Authorize one Transition operation. Missing auth context is allowed only for
 * the existing AUTH_DISABLED local mode; authenticated credentials require an
 * explicit scope and may never escape their project binding.
 */
export function requireTransitionAuthority(input: {
  apiKey: RequestPrincipal | undefined;
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
  apiKey: RequestPrincipal | undefined;
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

/**
 * Authorize one compatibility/product action without weakening the canonical
 * Transition scopes. Human credentials remain governed by project access, as
 * existing product routes are, while agent/service credentials need every
 * explicit scope supplied by the caller. When a ref is supplied, its policy is
 * resolved from server state and machine callers fail closed if it is absent.
 */
export async function resolveCompatibilityTransitionAuthority(input: {
  db: AnyDB;
  apiKey: RequestPrincipal | undefined;
  projectId: string;
  scopes: readonly TransitionScope[];
  refName?: string;
  requireMachinePolicyBinding?: boolean;
}): Promise<{
  principal: TrustedTransitionPrincipal;
  policyBinding: TransitionPolicyBinding | null;
}> {
  const principal = deriveTrustedTransitionPrincipal(input.apiKey);
  if (principal.projectId !== null && principal.projectId !== input.projectId) {
    throw new TransitionProjectScopeDeniedError(input.projectId);
  }
  if (principal.actor.kind !== 'human') {
    for (const scope of input.scopes) {
      requireTransitionAuthority({
        apiKey: input.apiKey,
        projectId: input.projectId,
        scope,
      });
    }
  }

  const policyBinding = input.refName
    ? await getTransitionPolicyBinding(input.db, input.projectId, input.refName)
    : null;
  if (
    principal.actor.kind !== 'human' &&
    input.requireMachinePolicyBinding === true &&
    policyBinding === null
  ) {
    throw new TransitionPolicyBindingRequiredError(input.projectId, input.refName ?? '<none>');
  }
  return { principal, policyBinding };
}

/**
 * Resolve the complete authority required by a compatibility endpoint that
 * creates an accepted Decision and advances a repository ref in one request.
 *
 * These routes predate the canonical Transition endpoints, but they must not
 * become a machine-capability bypass: authenticated agent/service callers need
 * every constituent scope and a server-selected ref policy. Existing human API
 * keys remain governed by project access for legacy compatibility, while still
 * using a ref policy when one is present. Actor identity is always derived from
 * the credential rather than request-shaped author fields. AUTH_DISABLED local
 * mode keeps the existing trusted local human behavior.
 */
export async function resolveCompatibilityTransitionWriteAuthority(input: {
  db: AnyDB;
  apiKey: RequestPrincipal | undefined;
  projectId: string;
  refName: string;
}): Promise<{
  principal: TrustedTransitionPrincipal;
  policyBinding: TransitionPolicyBinding | null;
}> {
  return resolveCompatibilityTransitionAuthority({
    ...input,
    scopes: [
      'transition:propose',
      'transition:decide:accept',
      'transition:commit:create',
      'transition:ref:advance',
    ],
    requireMachinePolicyBinding: true,
  });
}
