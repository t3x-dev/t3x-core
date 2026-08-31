import { and, asc, eq, isNull } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type Namespace, namespaces } from '../schema';
import {
  collaborationInvitations,
  type NamespaceMembershipRecord,
  namespaceMemberships,
  type ProjectGrantRecord,
  projectGrants,
  type UserRecord,
  users,
} from '../schema-trees';
import type {
  StoredCollaborationInvitationDto,
  StoredCollaborationPrincipalKind,
} from './collaboration-lifecycle';

export interface StoredPrincipalProfile {
  kind: StoredCollaborationPrincipalKind;
  principalId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface StoredNamespaceAccountFacts {
  namespace: Namespace;
  membership: NamespaceMembershipRecord;
  principal: StoredPrincipalProfile;
}

export interface StoredNamespaceMemberView {
  membership: NamespaceMembershipRecord;
  principal: StoredPrincipalProfile;
}

export interface StoredProjectGrantView {
  grant: ProjectGrantRecord;
  principal: StoredPrincipalProfile;
}

function principalProfile(
  kind: string,
  principalId: string,
  user: UserRecord | null
): StoredPrincipalProfile {
  const canonicalKind = kind as StoredCollaborationPrincipalKind;
  return {
    kind: canonicalKind,
    principalId,
    displayName: user?.name ?? null,
    email: canonicalKind === 'human' ? (user?.email ?? null) : null,
    avatarUrl: canonicalKind === 'human' ? (user?.avatarUrl ?? null) : null,
  };
}

function invitationDto(
  invitation: typeof collaborationInvitations.$inferSelect
): StoredCollaborationInvitationDto {
  const base = {
    invitation_id: invitation.invitationId,
    recipient: {
      user_id: invitation.recipientUserId,
      email: invitation.recipientEmail,
    },
    status: invitation.status as StoredCollaborationInvitationDto['status'],
    created_by: {
      kind: invitation.createdByPrincipalKind as StoredCollaborationPrincipalKind,
      principal_id: invitation.createdByPrincipalId,
    },
    created_at: invitation.createdAt.toISOString(),
    updated_at: invitation.updatedAt.toISOString(),
    expires_at: invitation.expiresAt.toISOString(),
    accepted_at: invitation.acceptedAt?.toISOString() ?? null,
    accepted_by_user_id: invitation.acceptedByUserId,
    revoked_at: invitation.revokedAt?.toISOString() ?? null,
    expired_at: invitation.expiredAt?.toISOString() ?? null,
  };

  return invitation.projectId
    ? {
        ...base,
        target: {
          kind: 'project',
          namespace_id: invitation.namespaceId,
          project_id: invitation.projectId,
        },
        role: invitation.role as 'admin' | 'editor' | 'viewer',
      }
    : {
        ...base,
        target: {
          kind: 'namespace',
          namespace_id: invitation.namespaceId,
          project_id: null,
        },
        role: invitation.role as 'admin' | 'editor' | 'viewer',
      };
}

/** List only current accounts for one server-derived principal. */
export async function listNamespaceAccountFacts(
  db: AnyDB,
  principal: { kind: StoredCollaborationPrincipalKind; principalId: string }
): Promise<StoredNamespaceAccountFacts[]> {
  const rows = await db
    .select({ namespace: namespaces, membership: namespaceMemberships, user: users })
    .from(namespaceMemberships)
    .innerJoin(namespaces, eq(namespaces.namespaceId, namespaceMemberships.namespaceId))
    .leftJoin(
      users,
      and(
        eq(namespaceMemberships.principalKind, 'human'),
        eq(users.id, namespaceMemberships.principalId)
      )
    )
    .where(
      and(
        eq(namespaceMemberships.principalKind, principal.kind),
        eq(namespaceMemberships.principalId, principal.principalId),
        eq(namespaceMemberships.status, 'active')
      )
    )
    .orderBy(asc(namespaces.slug), asc(namespaceMemberships.membershipId));

  return rows.map(({ namespace, membership, user }) => ({
    namespace,
    membership,
    principal: principalProfile(membership.principalKind, membership.principalId, user),
  }));
}

/** List namespace members with safe identity display fields and no auth secrets. */
export async function listNamespaceMemberViews(
  db: AnyDB,
  namespaceId: string
): Promise<StoredNamespaceMemberView[]> {
  const rows = await db
    .select({ membership: namespaceMemberships, user: users })
    .from(namespaceMemberships)
    .leftJoin(
      users,
      and(
        eq(namespaceMemberships.principalKind, 'human'),
        eq(users.id, namespaceMemberships.principalId)
      )
    )
    .where(eq(namespaceMemberships.namespaceId, namespaceId))
    .orderBy(asc(namespaceMemberships.createdAt), asc(namespaceMemberships.membershipId));

  return rows.map(({ membership, user }) => ({
    membership,
    principal: principalProfile(membership.principalKind, membership.principalId, user),
  }));
}

/** List exact project-scoped grants without widening them to namespace membership. */
export async function listProjectGrantViews(
  db: AnyDB,
  projectId: string
): Promise<StoredProjectGrantView[]> {
  const rows = await db
    .select({ grant: projectGrants, user: users })
    .from(projectGrants)
    .leftJoin(
      users,
      and(eq(projectGrants.principalKind, 'human'), eq(users.id, projectGrants.principalId))
    )
    .where(eq(projectGrants.projectId, projectId))
    .orderBy(asc(projectGrants.createdAt), asc(projectGrants.grantId));

  return rows.map(({ grant, user }) => ({
    grant,
    principal: principalProfile(grant.principalKind, grant.principalId, user),
  }));
}

/** Return safe namespace invitations; token hashes never leave persistence. */
export async function listNamespaceInvitationViews(
  db: AnyDB,
  namespaceId: string
): Promise<StoredCollaborationInvitationDto[]> {
  const rows = await db
    .select()
    .from(collaborationInvitations)
    .where(
      and(
        eq(collaborationInvitations.namespaceId, namespaceId),
        isNull(collaborationInvitations.projectId)
      )
    )
    .orderBy(asc(collaborationInvitations.createdAt), asc(collaborationInvitations.invitationId));
  return rows.map(invitationDto);
}

/** Return safe invitations for one exact project boundary. */
export async function listProjectInvitationViews(
  db: AnyDB,
  projectId: string
): Promise<StoredCollaborationInvitationDto[]> {
  const rows = await db
    .select()
    .from(collaborationInvitations)
    .where(eq(collaborationInvitations.projectId, projectId))
    .orderBy(asc(collaborationInvitations.createdAt), asc(collaborationInvitations.invitationId));
  return rows.map(invitationDto);
}
