import {
  type CanonicalPrincipalDto,
  evaluateNamespaceAction,
  MEMBERSHIP_STATUSES,
  NAMESPACE_ACTIONS,
  NAMESPACE_ROLES,
  type NamespaceAction,
  type NamespaceMembershipDto,
  PRINCIPAL_KINDS,
} from '@t3x-dev/application';
import {
  type AnyDB,
  findNamespaceMembershipForPrincipal,
  type Namespace,
  type NamespaceMembershipRecord,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { isAuthenticationDisabled } from './auth-config';
import { logAuthorizationDenial } from './authorization-denial-audit';
import { createError } from './errors';
import { getRequestPrincipal } from './request-principal';

function includesValue<T extends string>(values: readonly T[], value: string): value is T {
  return values.includes(value as T);
}

function membershipDto(record: NamespaceMembershipRecord | null): NamespaceMembershipDto | null {
  if (!record) return null;
  if (
    !includesValue(PRINCIPAL_KINDS, record.principalKind) ||
    !includesValue(NAMESPACE_ROLES, record.role) ||
    !includesValue(MEMBERSHIP_STATUSES, record.status)
  ) {
    return null;
  }
  return {
    membership_id: record.membershipId,
    namespace_id: record.namespaceId,
    principal: { kind: record.principalKind, principal_id: record.principalId },
    role: record.role,
    status: record.status,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}

export function getNamespacePrincipal(c: Context): CanonicalPrincipalDto | null {
  const principal = getRequestPrincipal(c);
  return principal?.credential.kind === 'local_dev' ? null : (principal?.subject ?? null);
}

export function getNamespaceCredentialScope(
  c: Context
): { project_id: string | null; namespace_id: string | null } | undefined {
  const credential = getRequestPrincipal(c)?.credential;
  return credential?.projectId || credential?.namespaceId
    ? { project_id: credential.projectId, namespace_id: credential.namespaceId }
    : undefined;
}

export function authorizedNamespaceActionsFromFacts(
  principal: CanonicalPrincipalDto,
  namespaceId: string,
  membership: NamespaceMembershipRecord | null,
  credentialScope?: { project_id: string | null; namespace_id: string | null }
): NamespaceAction[] {
  const facts = {
    principal,
    namespace: { namespace_id: namespaceId },
    namespace_membership: membershipDto(membership),
    ...(credentialScope ? { credential_scope: credentialScope } : {}),
  };
  return NAMESPACE_ACTIONS.filter((action) => evaluateNamespaceAction(facts, action).allowed);
}

/** Resolve all namespace actions from one exact stored membership read. */
export async function listAuthorizedNamespaceActions(
  c: Context,
  db: AnyDB,
  namespace: Namespace
): Promise<NamespaceAction[]> {
  const principal = getNamespacePrincipal(c);
  if (!principal) return isAuthenticationDisabled() ? [...NAMESPACE_ACTIONS] : [];
  const membership = await findNamespaceMembershipForPrincipal(db, {
    namespaceId: namespace.namespaceId,
    principal: { kind: principal.kind, principalId: principal.principal_id },
  });
  return authorizedNamespaceActionsFromFacts(
    principal,
    namespace.namespaceId,
    membership,
    getNamespaceCredentialScope(c)
  );
}

export async function assertNamespaceAccess(
  c: Context,
  db: AnyDB,
  namespace: Namespace,
  action: NamespaceAction
): Promise<void | Response> {
  const principal = getNamespacePrincipal(c);
  if (!principal) {
    if (isAuthenticationDisabled()) return;
    logAuthorizationDenial({
      principal: getRequestPrincipal(c),
      action,
      resource: { kind: 'namespace', id: namespace.namespaceId },
      reason: 'missing_principal',
    });
    return c.json(createError('FORBIDDEN', 'Namespace access denied'), 403);
  }

  const membership = await findNamespaceMembershipForPrincipal(db, {
    namespaceId: namespace.namespaceId,
    principal: { kind: principal.kind, principalId: principal.principal_id },
  });
  const credentialScope = getNamespaceCredentialScope(c);
  const decision = evaluateNamespaceAction(
    {
      principal,
      namespace: { namespace_id: namespace.namespaceId },
      namespace_membership: membershipDto(membership),
      ...(credentialScope ? { credential_scope: credentialScope } : {}),
    },
    action
  );
  if (!decision.allowed) {
    logAuthorizationDenial({
      principal: getRequestPrincipal(c),
      action,
      resource: { kind: 'namespace', id: namespace.namespaceId },
      reason: decision.reason,
    });
    return c.json(createError('FORBIDDEN', 'Namespace access denied'), 403);
  }
}
