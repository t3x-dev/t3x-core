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
import type { ApiKey } from '@t3x-dev/core';
import {
  type AnyDB,
  findNamespaceMembershipForPrincipal,
  type Namespace,
  type NamespaceMembershipRecord,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { isAuthenticationDisabled } from './auth-config';
import { createError } from './errors';

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
  const apiKey = c.get('apiKey') as ApiKey | undefined;
  if (!apiKey) return null;
  const kind = apiKey.principal_kind ?? 'human';
  const principalId = kind === 'human' ? apiKey.user_id : apiKey.id;
  return principalId && includesValue(PRINCIPAL_KINDS, kind)
    ? { kind, principal_id: principalId }
    : null;
}

export function authorizedNamespaceActionsFromFacts(
  principal: CanonicalPrincipalDto,
  namespaceId: string,
  membership: NamespaceMembershipRecord | null
): NamespaceAction[] {
  const facts = {
    principal,
    namespace: { namespace_id: namespaceId },
    namespace_membership: membershipDto(membership),
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
  return authorizedNamespaceActionsFromFacts(principal, namespace.namespaceId, membership);
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
    return c.json(createError('FORBIDDEN', 'Namespace access denied'), 403);
  }

  const membership = await findNamespaceMembershipForPrincipal(db, {
    namespaceId: namespace.namespaceId,
    principal: { kind: principal.kind, principalId: principal.principal_id },
  });
  const decision = evaluateNamespaceAction(
    {
      principal,
      namespace: { namespace_id: namespace.namespaceId },
      namespace_membership: membershipDto(membership),
    },
    action
  );
  if (!decision.allowed) {
    return c.json(createError('FORBIDDEN', 'Namespace access denied'), 403);
  }
}
