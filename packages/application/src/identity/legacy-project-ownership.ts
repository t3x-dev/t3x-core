import type { NamespaceMembershipDto } from './namespace-authorization';

export const LEGACY_PROJECT_QUARANTINE_REASONS = [
  'owner_missing',
  'personal_namespace_missing',
  'personal_owner_mismatch',
  'organization_membership_missing',
  'unknown_namespace',
] as const;
export type LegacyProjectQuarantineReason = (typeof LEGACY_PROJECT_QUARANTINE_REASONS)[number];

export interface LegacyProjectOwnershipRow {
  project_id: string;
  owner_id: string | null;
  namespace_id: string | null;
}

export interface NamespaceOwnershipInventoryRow {
  namespace_id: string;
  kind: 'personal' | 'organization';
  owner_user_id: string | null;
  /** True only for the known legacy/default bucket; a slug alone is never authority. */
  legacy_default: boolean;
}

export interface LegacyOwnershipInventory {
  namespaces: readonly NamespaceOwnershipInventoryRow[];
  memberships: readonly NamespaceMembershipDto[];
}

export type LegacyProjectOwnershipResolution =
  | {
      status: 'mapped';
      project_id: string;
      namespace_id: string;
      historical_creator_user_id: string;
      authority_source: 'personal_namespace_owner' | 'organization_membership';
    }
  | {
      status: 'quarantined';
      project_id: string;
      reason: LegacyProjectQuarantineReason;
    };

function personalNamespaceForOwner(
  inventory: LegacyOwnershipInventory,
  ownerId: string
): NamespaceOwnershipInventoryRow | undefined {
  return inventory.namespaces.find(
    (namespace) => namespace.kind === 'personal' && namespace.owner_user_id === ownerId
  );
}

/**
 * Produce a deterministic mapping decision without mutating storage. owner_id
 * survives as creator/provenance only; it is never a second permission engine.
 */
export function resolveLegacyProjectOwnership(
  row: LegacyProjectOwnershipRow,
  inventory: LegacyOwnershipInventory
): LegacyProjectOwnershipResolution {
  if (!row.owner_id) {
    return { status: 'quarantined', project_id: row.project_id, reason: 'owner_missing' };
  }

  const currentNamespace = row.namespace_id
    ? inventory.namespaces.find((namespace) => namespace.namespace_id === row.namespace_id)
    : undefined;

  if (row.namespace_id && !currentNamespace) {
    return { status: 'quarantined', project_id: row.project_id, reason: 'unknown_namespace' };
  }

  if (!currentNamespace || currentNamespace.legacy_default) {
    const personal = personalNamespaceForOwner(inventory, row.owner_id);
    if (!personal) {
      return {
        status: 'quarantined',
        project_id: row.project_id,
        reason: 'personal_namespace_missing',
      };
    }
    return {
      status: 'mapped',
      project_id: row.project_id,
      namespace_id: personal.namespace_id,
      historical_creator_user_id: row.owner_id,
      authority_source: 'personal_namespace_owner',
    };
  }

  if (currentNamespace.kind === 'personal') {
    if (currentNamespace.owner_user_id !== row.owner_id) {
      return {
        status: 'quarantined',
        project_id: row.project_id,
        reason: 'personal_owner_mismatch',
      };
    }
    return {
      status: 'mapped',
      project_id: row.project_id,
      namespace_id: currentNamespace.namespace_id,
      historical_creator_user_id: row.owner_id,
      authority_source: 'personal_namespace_owner',
    };
  }

  const activeMembership = inventory.memberships.find(
    (membership) =>
      membership.namespace_id === currentNamespace.namespace_id &&
      membership.principal.kind === 'human' &&
      membership.principal.principal_id === row.owner_id &&
      membership.status === 'active'
  );
  if (!activeMembership) {
    return {
      status: 'quarantined',
      project_id: row.project_id,
      reason: 'organization_membership_missing',
    };
  }

  return {
    status: 'mapped',
    project_id: row.project_id,
    namespace_id: currentNamespace.namespace_id,
    historical_creator_user_id: row.owner_id,
    authority_source: 'organization_membership',
  };
}
