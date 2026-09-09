import type {
  LegacyOwnershipInventory,
  LegacyProjectOwnershipResolution,
  LegacyProjectOwnershipRow,
} from './legacy-project-ownership';
import type {
  NamespaceMembershipDto,
  ProjectGrantDto,
  TrustedNamespaceAuthorityFacts,
} from './namespace-authorization';

const AT = '2026-08-29T00:00:00.000Z';

export function membership(input: {
  id: string;
  namespaceId: string;
  userId: string;
  role: NamespaceMembershipDto['role'];
  status?: NamespaceMembershipDto['status'];
}): NamespaceMembershipDto {
  return {
    membership_id: input.id,
    namespace_id: input.namespaceId,
    principal: { kind: 'human', principal_id: input.userId },
    role: input.role,
    status: input.status ?? 'active',
    created_at: AT,
    updated_at: AT,
  };
}

export function projectGrant(input: {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectGrantDto['role'];
  status?: ProjectGrantDto['status'];
}): ProjectGrantDto {
  return {
    grant_id: input.id,
    project_id: input.projectId,
    principal: { kind: 'human', principal_id: input.userId },
    role: input.role,
    status: input.status ?? 'active',
    created_at: AT,
    updated_at: AT,
    expires_at: null,
  };
}

export interface AuthorizationFixture {
  id: string;
  facts: TrustedNamespaceAuthorityFacts;
}

export const NAMESPACE_AUTHORIZATION_FIXTURES: readonly AuthorizationFixture[] = [
  {
    id: 'organization_owner',
    facts: {
      principal: { kind: 'human', principal_id: 'user_owner' },
      project: { project_id: 'project_team', namespace_id: 'namespace_team' },
      evaluated_at: AT,
      namespace_membership: membership({
        id: 'membership_owner',
        namespaceId: 'namespace_team',
        userId: 'user_owner',
        role: 'owner',
      }),
      project_grant: null,
    },
  },
  {
    id: 'project_guest_editor',
    facts: {
      principal: { kind: 'human', principal_id: 'user_guest' },
      project: { project_id: 'project_team', namespace_id: 'namespace_team' },
      evaluated_at: AT,
      namespace_membership: null,
      project_grant: projectGrant({
        id: 'grant_guest',
        projectId: 'project_team',
        userId: 'user_guest',
        role: 'editor',
      }),
    },
  },
  {
    id: 'revoked_member',
    facts: {
      principal: { kind: 'human', principal_id: 'user_removed' },
      project: { project_id: 'project_team', namespace_id: 'namespace_team' },
      evaluated_at: AT,
      namespace_membership: membership({
        id: 'membership_removed',
        namespaceId: 'namespace_team',
        userId: 'user_removed',
        role: 'editor',
        status: 'revoked',
      }),
      project_grant: null,
    },
  },
  {
    id: 'scoped_service_principal',
    facts: {
      principal: { kind: 'service', principal_id: 'service_ci' },
      project: { project_id: 'project_team', namespace_id: 'namespace_team' },
      evaluated_at: AT,
      namespace_membership: {
        ...membership({
          id: 'membership_service',
          namespaceId: 'namespace_team',
          userId: 'service_ci',
          role: 'admin',
        }),
        principal: { kind: 'service', principal_id: 'service_ci' },
      },
      project_grant: null,
      credential_scope: { project_id: 'project_team', actions: ['project:read'] },
    },
  },
];

const legacyInventory: LegacyOwnershipInventory = {
  namespaces: [
    {
      namespace_id: 'namespace_personal_owner',
      kind: 'personal',
      owner_user_id: 'user_owner',
      legacy_default: false,
    },
    {
      namespace_id: 'namespace_personal_other',
      kind: 'personal',
      owner_user_id: 'user_other',
      legacy_default: false,
    },
    {
      namespace_id: 'namespace_team',
      kind: 'organization',
      owner_user_id: null,
      legacy_default: false,
    },
    {
      namespace_id: 'ns_t3x_dev',
      kind: 'organization',
      owner_user_id: null,
      legacy_default: true,
    },
  ],
  memberships: [
    membership({
      id: 'membership_team_owner',
      namespaceId: 'namespace_team',
      userId: 'user_owner',
      role: 'owner',
    }),
  ],
};

export interface LegacyOwnershipFixture {
  id: string;
  row: LegacyProjectOwnershipRow;
  inventory: LegacyOwnershipInventory;
  expected: LegacyProjectOwnershipResolution;
}

export const LEGACY_OWNERSHIP_FIXTURES: readonly LegacyOwnershipFixture[] = [
  {
    id: 'personal_exact_match',
    row: {
      project_id: 'project_personal',
      owner_id: 'user_owner',
      namespace_id: 'namespace_personal_owner',
    },
    inventory: legacyInventory,
    expected: {
      status: 'mapped',
      project_id: 'project_personal',
      namespace_id: 'namespace_personal_owner',
      historical_creator_user_id: 'user_owner',
      authority_source: 'personal_namespace_owner',
    },
  },
  {
    id: 'legacy_default_maps_to_personal',
    row: {
      project_id: 'project_default',
      owner_id: 'user_owner',
      namespace_id: 'ns_t3x_dev',
    },
    inventory: legacyInventory,
    expected: {
      status: 'mapped',
      project_id: 'project_default',
      namespace_id: 'namespace_personal_owner',
      historical_creator_user_id: 'user_owner',
      authority_source: 'personal_namespace_owner',
    },
  },
  {
    id: 'organization_requires_membership',
    row: {
      project_id: 'project_team',
      owner_id: 'user_owner',
      namespace_id: 'namespace_team',
    },
    inventory: legacyInventory,
    expected: {
      status: 'mapped',
      project_id: 'project_team',
      namespace_id: 'namespace_team',
      historical_creator_user_id: 'user_owner',
      authority_source: 'organization_membership',
    },
  },
  {
    id: 'ownerless_default_quarantined',
    row: { project_id: 'project_ownerless', owner_id: null, namespace_id: 'ns_t3x_dev' },
    inventory: legacyInventory,
    expected: { status: 'quarantined', project_id: 'project_ownerless', reason: 'owner_missing' },
  },
  {
    id: 'personal_mismatch_quarantined',
    row: {
      project_id: 'project_mismatch',
      owner_id: 'user_other',
      namespace_id: 'namespace_personal_owner',
    },
    inventory: legacyInventory,
    expected: {
      status: 'quarantined',
      project_id: 'project_mismatch',
      reason: 'personal_owner_mismatch',
    },
  },
];
