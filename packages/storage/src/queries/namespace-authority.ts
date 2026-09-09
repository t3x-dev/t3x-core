import { and, eq, isNull } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type Project, projects } from '../schema';
import {
  type NamespaceMembershipRecord,
  namespaceMemberships,
  type ProjectGrantRecord,
  projectGrants,
} from '../schema-trees';

export type StoredPrincipalKind = 'human' | 'agent' | 'service';

export interface StoredAuthorityPrincipal {
  kind: StoredPrincipalKind;
  principalId: string;
}

export interface StoredProjectAuthorityFacts {
  project: Project;
  namespaceMembership: NamespaceMembershipRecord | null;
  projectGrant: ProjectGrantRecord | null;
}

/**
 * Load one canonical project plus the exact membership/grant rows for a
 * server-derived principal. Revoked and expired rows remain visible so the
 * application evaluator can fail closed with a deterministic reason.
 */
export async function findProjectAuthorityFacts(
  db: AnyDB,
  input: {
    projectId: string;
    principal: StoredAuthorityPrincipal;
    includeDeleted?: boolean;
  }
): Promise<StoredProjectAuthorityFacts | null> {
  const [row] = await db
    .select({
      project: projects,
      namespaceMembership: namespaceMemberships,
      projectGrant: projectGrants,
    })
    .from(projects)
    .leftJoin(
      namespaceMemberships,
      and(
        eq(namespaceMemberships.namespaceId, projects.namespaceId),
        eq(namespaceMemberships.principalKind, input.principal.kind),
        eq(namespaceMemberships.principalId, input.principal.principalId)
      )
    )
    .leftJoin(
      projectGrants,
      and(
        eq(projectGrants.projectId, projects.projectId),
        eq(projectGrants.namespaceId, projects.namespaceId),
        eq(projectGrants.principalKind, input.principal.kind),
        eq(projectGrants.principalId, input.principal.principalId)
      )
    )
    .where(
      and(
        eq(projects.projectId, input.projectId),
        input.includeDeleted ? undefined : isNull(projects.deletedAt)
      )
    )
    .limit(1);

  return row ?? null;
}

/** Load the exact namespace membership used for namespace-wide actions. */
export async function findNamespaceMembershipForPrincipal(
  db: AnyDB,
  input: { namespaceId: string; principal: StoredAuthorityPrincipal }
): Promise<NamespaceMembershipRecord | null> {
  const [membership] = await db
    .select()
    .from(namespaceMemberships)
    .where(
      and(
        eq(namespaceMemberships.namespaceId, input.namespaceId),
        eq(namespaceMemberships.principalKind, input.principal.kind),
        eq(namespaceMemberships.principalId, input.principal.principalId)
      )
    )
    .limit(1);

  return membership ?? null;
}
