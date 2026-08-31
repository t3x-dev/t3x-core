import { randomUUID } from 'node:crypto';
import { and, eq, gt, inArray, ne, or, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { namespaces, projects } from '../schema';
import {
  type CollaborationInvitationRecord,
  collaborationInvitations,
  type NamespaceMembershipRecord,
  namespaceMemberships,
  type ProjectGrantRecord,
  projectGrants,
} from '../schema-trees';

export type StoredCollaborationPrincipalKind = 'human' | 'agent' | 'service';
export type StoredNamespaceRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type StoredNamespaceMemberRole = Exclude<StoredNamespaceRole, 'owner'>;
export type StoredProjectGrantRole = 'admin' | 'editor' | 'viewer';
export type StoredMembershipStatus = 'active' | 'revoked';
export type StoredInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface StoredCollaborationPrincipalDto {
  kind: StoredCollaborationPrincipalKind;
  principal_id: string;
}

export interface StoredNamespaceMembershipDto {
  membership_id: string;
  namespace_id: string;
  principal: StoredCollaborationPrincipalDto;
  role: StoredNamespaceRole;
  status: StoredMembershipStatus;
  created_at: string;
  updated_at: string;
}

export interface StoredProjectGrantDto {
  grant_id: string;
  project_id: string;
  principal: StoredCollaborationPrincipalDto;
  role: StoredProjectGrantRole;
  status: StoredMembershipStatus;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

export type StoredCollaborationInvitationTarget =
  | { kind: 'namespace'; namespace_id: string; project_id: null }
  | { kind: 'project'; namespace_id: string; project_id: string };

interface StoredCollaborationInvitationBaseDto {
  invitation_id: string;
  recipient: { user_id: string | null; email: string | null };
  status: StoredInvitationStatus;
  created_by: StoredCollaborationPrincipalDto;
  created_at: string;
  updated_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
  revoked_at: string | null;
  expired_at: string | null;
}

export type StoredCollaborationInvitationDto = StoredCollaborationInvitationBaseDto &
  (
    | {
        target: Extract<StoredCollaborationInvitationTarget, { kind: 'namespace' }>;
        role: StoredNamespaceMemberRole;
      }
    | {
        target: Extract<StoredCollaborationInvitationTarget, { kind: 'project' }>;
        role: StoredProjectGrantRole;
      }
  );

export type StoredCollaborationInvitationInsert = StoredCollaborationInvitationDto & {
  token_hash: string;
};

export interface StoredNamespaceOwnershipTransferPlan {
  namespace_id: string;
  demote: { membership_id: string; role: 'admin' };
  promote: { membership_id: string; role: 'owner' };
}

export interface StoredProjectTransferPlan {
  project_id: string;
  source_namespace_id: string;
  target_namespace_id: string;
}

export type CollaborationStorageErrorCode =
  | 'INVALID_TIMESTAMP'
  | 'INVITATION_STATE_CONFLICT'
  | 'NAMESPACE_NOT_FOUND'
  | 'OWNERSHIP_TRANSFER_CONFLICT'
  | 'PROJECT_TRANSFER_BLOCKED'
  | 'PROJECT_TRANSFER_CONFLICT';

export class CollaborationStorageError extends Error {
  constructor(
    readonly code: CollaborationStorageErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'CollaborationStorageError';
  }
}

export interface PostgresCollaborationLifecycleTransaction {
  lockNamespace(namespaceId: string): Promise<void>;
  findNamespaceMembershipForUpdate(input: {
    namespaceId: string;
    membershipId: string;
  }): Promise<StoredNamespaceMembershipDto | null>;
  countActiveHumanOwnersForUpdate(namespaceId: string): Promise<number>;
  upsertNamespaceMembership(input: {
    namespaceId: string;
    principal: StoredCollaborationPrincipalDto;
    role: StoredNamespaceMemberRole;
  }): Promise<StoredNamespaceMembershipDto>;
  revokeNamespaceMembership(membershipId: string, revokedAt: string): Promise<void>;
  upsertProjectGrant(input: {
    namespaceId: string;
    projectId: string;
    principal: StoredCollaborationPrincipalDto;
    role: StoredProjectGrantRole;
    expiresAt: string | null;
  }): Promise<StoredProjectGrantDto>;
  revokeProjectGrant(grantId: string, revokedAt: string): Promise<void>;
  applyProjectTransfer(plan: StoredProjectTransferPlan): Promise<void>;
  createInvitation(invitation: StoredCollaborationInvitationInsert): Promise<void>;
  findInvitationByTokenHashForUpdate(
    tokenHash: string
  ): Promise<StoredCollaborationInvitationDto | null>;
  acceptInvitation(input: {
    invitationId: string;
    acceptedByUserId: string;
    acceptedAt: string;
  }): Promise<void>;
  revokeInvitation(invitationId: string, revokedAt: string): Promise<void>;
  applyOwnershipTransfer(
    plan: StoredNamespaceOwnershipTransferPlan,
    updatedAt: string
  ): Promise<void>;
}

export interface PostgresCollaborationLifecycleUnitOfWork {
  transaction<Result>(
    operation: (transaction: PostgresCollaborationLifecycleTransaction) => Promise<Result>
  ): Promise<Result>;
}

const COLLABORATION_LOCK_NAMESPACE = 0x636f_6c6c; // 'coll'

function instant(value: string, field: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new CollaborationStorageError('INVALID_TIMESTAMP', `${field} must be a valid timestamp`);
  }
  return parsed;
}

function membershipDto(record: NamespaceMembershipRecord): StoredNamespaceMembershipDto {
  return {
    membership_id: record.membershipId,
    namespace_id: record.namespaceId,
    principal: {
      kind: record.principalKind as StoredCollaborationPrincipalKind,
      principal_id: record.principalId,
    },
    role: record.role as StoredNamespaceRole,
    status: record.status as StoredMembershipStatus,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}

function projectGrantDto(record: ProjectGrantRecord): StoredProjectGrantDto {
  return {
    grant_id: record.grantId,
    project_id: record.projectId,
    principal: {
      kind: record.principalKind as StoredCollaborationPrincipalKind,
      principal_id: record.principalId,
    },
    role: record.role as StoredProjectGrantRole,
    status: record.status as StoredMembershipStatus,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    expires_at: record.expiresAt?.toISOString() ?? null,
  };
}

function invitationDto(record: CollaborationInvitationRecord): StoredCollaborationInvitationDto {
  const base: StoredCollaborationInvitationBaseDto = {
    invitation_id: record.invitationId,
    recipient: { user_id: record.recipientUserId, email: record.recipientEmail },
    status: record.status as StoredInvitationStatus,
    created_by: {
      kind: record.createdByPrincipalKind as StoredCollaborationPrincipalKind,
      principal_id: record.createdByPrincipalId,
    },
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    expires_at: record.expiresAt.toISOString(),
    accepted_at: record.acceptedAt?.toISOString() ?? null,
    accepted_by_user_id: record.acceptedByUserId,
    revoked_at: record.revokedAt?.toISOString() ?? null,
    expired_at: record.expiredAt?.toISOString() ?? null,
  };
  return record.projectId
    ? {
        ...base,
        target: { kind: 'project', namespace_id: record.namespaceId, project_id: record.projectId },
        role: record.role as StoredProjectGrantRole,
      }
    : {
        ...base,
        target: { kind: 'namespace', namespace_id: record.namespaceId, project_id: null },
        role: record.role as StoredNamespaceMemberRole,
      };
}

async function acquireNamespaceAdvisoryLock(db: AnyDB, namespaceId: string): Promise<void> {
  await db.execute(
    sql`SELECT pg_advisory_xact_lock(${COLLABORATION_LOCK_NAMESPACE}::int, hashtext(${namespaceId})::int)`
  );
}

async function lockNamespace(db: AnyDB, namespaceId: string): Promise<void> {
  await acquireNamespaceAdvisoryLock(db, namespaceId);
  const [namespace] = await db
    .select({ namespaceId: namespaces.namespaceId })
    .from(namespaces)
    .where(eq(namespaces.namespaceId, namespaceId))
    .for('update')
    .limit(1);
  if (!namespace) {
    throw new CollaborationStorageError(
      'NAMESPACE_NOT_FOUND',
      `Namespace ${namespaceId} does not exist`
    );
  }
}

function createTransactionAdapter(db: AnyDB): PostgresCollaborationLifecycleTransaction {
  return {
    lockNamespace: (namespaceId) => lockNamespace(db, namespaceId),

    async findNamespaceMembershipForUpdate(input) {
      const [record] = await db
        .select()
        .from(namespaceMemberships)
        .where(
          and(
            eq(namespaceMemberships.namespaceId, input.namespaceId),
            eq(namespaceMemberships.membershipId, input.membershipId)
          )
        )
        .for('update')
        .limit(1);
      return record ? membershipDto(record) : null;
    },

    async countActiveHumanOwnersForUpdate(namespaceId) {
      const [row] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(namespaceMemberships)
        .where(
          and(
            eq(namespaceMemberships.namespaceId, namespaceId),
            eq(namespaceMemberships.principalKind, 'human'),
            eq(namespaceMemberships.role, 'owner'),
            eq(namespaceMemberships.status, 'active')
          )
        );
      return Number(row?.value ?? 0);
    },

    async upsertNamespaceMembership(input) {
      const now = new Date();
      const [record] = await db
        .insert(namespaceMemberships)
        .values({
          membershipId: `nsm_${randomUUID().replaceAll('-', '')}`,
          namespaceId: input.namespaceId,
          principalKind: input.principal.kind,
          principalId: input.principal.principal_id,
          role: input.role,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          revokedAt: null,
        })
        .onConflictDoUpdate({
          target: [
            namespaceMemberships.namespaceId,
            namespaceMemberships.principalKind,
            namespaceMemberships.principalId,
          ],
          set: { role: input.role, status: 'active', updatedAt: now, revokedAt: null },
        })
        .returning();
      if (!record) throw new Error('Namespace membership upsert returned no row');
      return membershipDto(record);
    },

    async revokeNamespaceMembership(membershipId, revokedAt) {
      const at = instant(revokedAt, 'revokedAt');
      await db
        .update(namespaceMemberships)
        .set({ status: 'revoked', revokedAt: at, updatedAt: at })
        .where(
          and(
            eq(namespaceMemberships.membershipId, membershipId),
            eq(namespaceMemberships.status, 'active')
          )
        );
    },

    async upsertProjectGrant(input) {
      const now = new Date();
      const [record] = await db
        .insert(projectGrants)
        .values({
          grantId: `pgr_${randomUUID().replaceAll('-', '')}`,
          projectId: input.projectId,
          namespaceId: input.namespaceId,
          principalKind: input.principal.kind,
          principalId: input.principal.principal_id,
          role: input.role,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          expiresAt: input.expiresAt ? instant(input.expiresAt, 'expiresAt') : null,
          revokedAt: null,
        })
        .onConflictDoUpdate({
          target: [projectGrants.projectId, projectGrants.principalKind, projectGrants.principalId],
          set: {
            namespaceId: input.namespaceId,
            role: input.role,
            status: 'active',
            updatedAt: now,
            expiresAt: input.expiresAt ? instant(input.expiresAt, 'expiresAt') : null,
            revokedAt: null,
          },
        })
        .returning();
      if (!record) throw new Error('Project grant upsert returned no row');
      return projectGrantDto(record);
    },

    async revokeProjectGrant(grantId, revokedAt) {
      const at = instant(revokedAt, 'revokedAt');
      await db
        .update(projectGrants)
        .set({ status: 'revoked', revokedAt: at, updatedAt: at })
        .where(and(eq(projectGrants.grantId, grantId), eq(projectGrants.status, 'active')));
    },

    async applyProjectTransfer(plan) {
      if (plan.source_namespace_id === plan.target_namespace_id) {
        throw new CollaborationStorageError(
          'PROJECT_TRANSFER_CONFLICT',
          'Project transfer requires a different target namespace'
        );
      }
      const lockIds = [plan.source_namespace_id, plan.target_namespace_id].sort();
      for (const namespaceId of lockIds) await lockNamespace(db, namespaceId);

      const [grant] = await db
        .select({ id: projectGrants.grantId })
        .from(projectGrants)
        .where(eq(projectGrants.projectId, plan.project_id))
        .limit(1);
      const [invitation] = await db
        .select({ id: collaborationInvitations.invitationId })
        .from(collaborationInvitations)
        .where(eq(collaborationInvitations.projectId, plan.project_id))
        .limit(1);
      if (grant || invitation) {
        throw new CollaborationStorageError(
          'PROJECT_TRANSFER_BLOCKED',
          'Project transfer is blocked while project collaboration history exists'
        );
      }

      const [updated] = await db
        .update(projects)
        .set({ namespaceId: plan.target_namespace_id })
        .where(
          and(
            eq(projects.projectId, plan.project_id),
            eq(projects.namespaceId, plan.source_namespace_id)
          )
        )
        .returning({ projectId: projects.projectId });
      if (!updated) {
        throw new CollaborationStorageError(
          'PROJECT_TRANSFER_CONFLICT',
          'Project no longer belongs to the expected source namespace'
        );
      }
    },

    async createInvitation(invitation) {
      await db.insert(collaborationInvitations).values({
        invitationId: invitation.invitation_id,
        namespaceId: invitation.target.namespace_id,
        projectId: invitation.target.project_id,
        recipientUserId: invitation.recipient.user_id,
        recipientEmail: invitation.recipient.email?.trim().toLowerCase() ?? null,
        role: invitation.role,
        tokenHash: invitation.token_hash,
        status: invitation.status,
        createdByPrincipalKind: invitation.created_by.kind,
        createdByPrincipalId: invitation.created_by.principal_id,
        createdAt: instant(invitation.created_at, 'createdAt'),
        updatedAt: instant(invitation.updated_at, 'updatedAt'),
        expiresAt: instant(invitation.expires_at, 'expiresAt'),
        acceptedAt: invitation.accepted_at ? instant(invitation.accepted_at, 'acceptedAt') : null,
        acceptedByUserId: invitation.accepted_by_user_id,
        revokedAt: invitation.revoked_at ? instant(invitation.revoked_at, 'revokedAt') : null,
        expiredAt: invitation.expired_at ? instant(invitation.expired_at, 'expiredAt') : null,
      });
    },

    async findInvitationByTokenHashForUpdate(tokenHash) {
      const [record] = await db
        .select()
        .from(collaborationInvitations)
        .where(eq(collaborationInvitations.tokenHash, tokenHash))
        .for('update')
        .limit(1);
      return record ? invitationDto(record) : null;
    },

    async acceptInvitation(input) {
      const acceptedAt = instant(input.acceptedAt, 'acceptedAt');
      const [updated] = await db
        .update(collaborationInvitations)
        .set({
          status: 'accepted',
          acceptedAt,
          acceptedByUserId: input.acceptedByUserId,
          updatedAt: acceptedAt,
        })
        .where(
          and(
            eq(collaborationInvitations.invitationId, input.invitationId),
            eq(collaborationInvitations.status, 'pending'),
            gt(collaborationInvitations.expiresAt, acceptedAt)
          )
        )
        .returning({ invitationId: collaborationInvitations.invitationId });
      if (!updated) {
        throw new CollaborationStorageError(
          'INVITATION_STATE_CONFLICT',
          'Invitation is no longer pending or has expired'
        );
      }
    },

    async revokeInvitation(invitationId, revokedAt) {
      const at = instant(revokedAt, 'revokedAt');
      const [updated] = await db
        .update(collaborationInvitations)
        .set({ status: 'revoked', revokedAt: at, updatedAt: at })
        .where(
          and(
            eq(collaborationInvitations.invitationId, invitationId),
            eq(collaborationInvitations.status, 'pending')
          )
        )
        .returning({ invitationId: collaborationInvitations.invitationId });
      if (updated) return;
      const [existing] = await db
        .select({ status: collaborationInvitations.status })
        .from(collaborationInvitations)
        .where(eq(collaborationInvitations.invitationId, invitationId))
        .limit(1);
      if (existing?.status !== 'revoked') {
        throw new CollaborationStorageError(
          'INVITATION_STATE_CONFLICT',
          'Only a pending invitation may be revoked'
        );
      }
    },

    async applyOwnershipTransfer(plan, updatedAt) {
      const at = instant(updatedAt, 'updatedAt');
      const ids = [plan.demote.membership_id, plan.promote.membership_id];
      const updated = await db
        .update(namespaceMemberships)
        .set({
          role: sql<string>`CASE WHEN ${namespaceMemberships.membershipId} = ${plan.demote.membership_id} THEN 'admin' ELSE 'owner' END`,
          updatedAt: at,
        })
        .where(
          and(
            eq(namespaceMemberships.namespaceId, plan.namespace_id),
            eq(namespaceMemberships.status, 'active'),
            inArray(namespaceMemberships.membershipId, ids),
            or(
              and(
                eq(namespaceMemberships.membershipId, plan.demote.membership_id),
                eq(namespaceMemberships.principalKind, 'human'),
                eq(namespaceMemberships.role, 'owner')
              ),
              and(
                eq(namespaceMemberships.membershipId, plan.promote.membership_id),
                eq(namespaceMemberships.principalKind, 'human'),
                ne(namespaceMemberships.role, 'owner')
              )
            )
          )
        )
        .returning({ membershipId: namespaceMemberships.membershipId });
      if (updated.length !== 2) {
        throw new CollaborationStorageError(
          'OWNERSHIP_TRANSFER_CONFLICT',
          'Ownership transfer memberships changed before the atomic update'
        );
      }
    },
  };
}

type TransactionRunner = {
  transaction<Result>(operation: (transaction: unknown) => Promise<Result>): Promise<Result>;
};

/**
 * PostgreSQL unit of work structurally implements the application lifecycle
 * port without making the publishable storage package depend on the internal
 * application package.
 */
export function createPostgresCollaborationLifecycleUnitOfWork(
  db: AnyDB
): PostgresCollaborationLifecycleUnitOfWork {
  const unitOfWork: PostgresCollaborationLifecycleUnitOfWork = {
    transaction<Result>(
      operation: (transaction: PostgresCollaborationLifecycleTransaction) => Promise<Result>
    ) {
      return (db as unknown as TransactionRunner).transaction((transaction) =>
        operation(createTransactionAdapter(transaction as AnyDB))
      );
    },
  };
  return unitOfWork;
}
