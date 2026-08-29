export const NAMESPACE_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type NamespaceRole = (typeof NAMESPACE_ROLES)[number];

export const PROJECT_GRANT_ROLES = ['admin', 'editor', 'viewer'] as const;
export type ProjectGrantRole = (typeof PROJECT_GRANT_ROLES)[number];

export const PRINCIPAL_KINDS = ['human', 'agent', 'service'] as const;
export type PrincipalKind = (typeof PRINCIPAL_KINDS)[number];

export const MEMBERSHIP_STATUSES = ['active', 'suspended', 'revoked'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const NAMESPACE_ACTIONS = [
  'namespace:read',
  'namespace:update',
  'namespace:members:read',
  'namespace:members:manage',
  'namespace:invitations:manage',
  'namespace:ownership:transfer',
  'project:create',
  'project:read',
  'project:edit',
  'project:delete',
  'project:restore',
  'project:guests:manage',
  'project:transfer',
] as const;
export type NamespaceAction = (typeof NAMESPACE_ACTIONS)[number];

export const PROJECT_ACTIONS = [
  'project:read',
  'project:edit',
  'project:delete',
  'project:restore',
  'project:guests:manage',
  'project:transfer',
] as const;
export type ProjectAction = (typeof PROJECT_ACTIONS)[number];

const OWNER_ACTIONS = [...NAMESPACE_ACTIONS] as const;
const ADMIN_ACTIONS = NAMESPACE_ACTIONS.filter(
  (action) => action !== 'namespace:ownership:transfer'
);
const EDITOR_ACTIONS = [
  'namespace:read',
  'namespace:members:read',
  'project:create',
  'project:read',
  'project:edit',
] as const satisfies readonly NamespaceAction[];
const VIEWER_ACTIONS = [
  'namespace:read',
  'project:read',
] as const satisfies readonly NamespaceAction[];

export const NAMESPACE_ROLE_ACTIONS: Readonly<Record<NamespaceRole, readonly NamespaceAction[]>> = {
  owner: OWNER_ACTIONS,
  admin: ADMIN_ACTIONS,
  editor: EDITOR_ACTIONS,
  viewer: VIEWER_ACTIONS,
};

export const PROJECT_GRANT_ACTIONS: Readonly<Record<ProjectGrantRole, readonly ProjectAction[]>> = {
  admin: [
    'project:read',
    'project:edit',
    'project:delete',
    'project:restore',
    'project:guests:manage',
  ],
  editor: ['project:read', 'project:edit'],
  viewer: ['project:read'],
};

export interface CanonicalPrincipalDto {
  kind: PrincipalKind;
  principal_id: string;
}

export interface NamespaceMembershipDto {
  membership_id: string;
  namespace_id: string;
  principal: CanonicalPrincipalDto;
  role: NamespaceRole;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
}

export interface ProjectGrantDto {
  grant_id: string;
  project_id: string;
  principal: CanonicalPrincipalDto;
  role: ProjectGrantRole;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

export interface TrustedNamespaceAuthorityFacts {
  principal: CanonicalPrincipalDto;
  project: { project_id: string; namespace_id: string };
  namespace_membership: NamespaceMembershipDto | null;
  project_grant: ProjectGrantDto | null;
  /**
   * Server-resolved credential restriction. Undefined represents a browser or
   * other full human session. It is never populated from request JSON.
   */
  credential_scope?: {
    project_id: string | null;
    actions: readonly ProjectAction[];
  };
}

export type ProjectActionDecision =
  | { allowed: true; source: 'namespace_membership' | 'project_grant' }
  | {
      allowed: false;
      reason:
        | 'credential_project_mismatch'
        | 'credential_scope_denied'
        | 'machine_principal_requires_project_scope'
        | 'inactive_membership'
        | 'inactive_project_grant'
        | 'namespace_mismatch'
        | 'project_mismatch'
        | 'role_denied'
        | 'no_authority';
    };

function samePrincipal(left: CanonicalPrincipalDto, right: CanonicalPrincipalDto): boolean {
  return left.kind === right.kind && left.principal_id === right.principal_id;
}

function credentialDenial(
  facts: TrustedNamespaceAuthorityFacts,
  action: ProjectAction
): ProjectActionDecision | null {
  const { credential_scope: scope, principal, project } = facts;
  if (!scope) {
    return principal.kind === 'human'
      ? null
      : { allowed: false, reason: 'machine_principal_requires_project_scope' };
  }
  if (scope.project_id !== project.project_id) {
    return { allowed: false, reason: 'credential_project_mismatch' };
  }
  if (!scope.actions.includes(action)) {
    return { allowed: false, reason: 'credential_scope_denied' };
  }
  return null;
}

/**
 * Evaluate only current server-resolved state. Legacy owner_id, JWT roles,
 * client namespace IDs, plan entitlements, and billing state are deliberately
 * absent from this reusable collaboration decision.
 */
export function evaluateProjectAction(
  facts: TrustedNamespaceAuthorityFacts,
  action: ProjectAction
): ProjectActionDecision {
  const scopeDenial = credentialDenial(facts, action);
  if (scopeDenial) return scopeDenial;

  const membership = facts.namespace_membership;
  if (membership) {
    if (!samePrincipal(membership.principal, facts.principal)) {
      return { allowed: false, reason: 'no_authority' };
    }
    if (membership.namespace_id !== facts.project.namespace_id) {
      return { allowed: false, reason: 'namespace_mismatch' };
    }
    if (membership.status !== 'active') {
      return { allowed: false, reason: 'inactive_membership' };
    }
    if (NAMESPACE_ROLE_ACTIONS[membership.role].includes(action)) {
      return { allowed: true, source: 'namespace_membership' };
    }
  }

  const grant = facts.project_grant;
  if (grant) {
    if (!samePrincipal(grant.principal, facts.principal)) {
      return { allowed: false, reason: 'no_authority' };
    }
    if (grant.project_id !== facts.project.project_id) {
      return { allowed: false, reason: 'project_mismatch' };
    }
    if (grant.status !== 'active') {
      return { allowed: false, reason: 'inactive_project_grant' };
    }
    if (PROJECT_GRANT_ACTIONS[grant.role].includes(action)) {
      return { allowed: true, source: 'project_grant' };
    }
  }

  if (membership || grant) return { allowed: false, reason: 'role_denied' };
  return { allowed: false, reason: 'no_authority' };
}

export function namespaceRoleAllows(role: NamespaceRole, action: NamespaceAction): boolean {
  return NAMESPACE_ROLE_ACTIONS[role].includes(action);
}

export function projectGrantRoleAllows(role: ProjectGrantRole, action: ProjectAction): boolean {
  return PROJECT_GRANT_ACTIONS[role].includes(action);
}
