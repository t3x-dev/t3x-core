import type {
  CanonicalPrincipalDto,
  NamespaceMembershipDto,
  NamespaceRole,
  ProjectGrantDto,
  ProjectGrantRole,
} from './namespace-authorization';

export const COLLABORATION_INVITATION_STATUSES = [
  'pending',
  'accepted',
  'revoked',
  'expired',
] as const;
export type CollaborationInvitationStatus = (typeof COLLABORATION_INVITATION_STATUSES)[number];

export const COLLABORATION_COMMAND_KINDS = [
  'namespace_member.upsert',
  'namespace_member.revoke',
  'project_guest.grant',
  'project_guest.revoke',
  'project.transfer',
  'invitation.create',
  'invitation.accept',
  'invitation.revoke',
  'namespace_ownership.transfer',
] as const;
export type CollaborationCommandKind = (typeof COLLABORATION_COMMAND_KINDS)[number];

export type NamespaceMemberRole = Exclude<NamespaceRole, 'owner'>;
export type HumanPrincipalDto = CanonicalPrincipalDto & { kind: 'human' };

export type CollaborationInvitationTarget =
  | { kind: 'namespace'; namespace_id: string; project_id: null }
  | { kind: 'project'; namespace_id: string; project_id: string };

interface CollaborationInvitationBaseDto {
  invitation_id: string;
  recipient: { user_id: string | null; email: string | null };
  status: CollaborationInvitationStatus;
  created_by: CanonicalPrincipalDto;
  created_at: string;
  updated_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
  revoked_at: string | null;
  expired_at: string | null;
}

/** Safe lifecycle DTO: token hashes are deliberately absent from this shape. */
export type CollaborationInvitationDto = CollaborationInvitationBaseDto &
  (
    | {
        target: Extract<CollaborationInvitationTarget, { kind: 'namespace' }>;
        role: NamespaceMemberRole;
      }
    | {
        target: Extract<CollaborationInvitationTarget, { kind: 'project' }>;
        role: ProjectGrantRole;
      }
  );

/** Internal persistence shape. Never serialize this record to an API client. */
export type StoredCollaborationInvitationDto = CollaborationInvitationDto & {
  token_hash: string;
};

interface CollaborationCommandBase {
  /** Server-generated idempotency key; never trusted from anonymous input. */
  request_id: string;
  /** Server-derived principal. */
  actor: CanonicalPrincipalDto;
  /** Server clock captured before authorization and mutation. */
  evaluated_at: string;
}

export type CollaborationLifecycleCommand =
  | (CollaborationCommandBase & {
      kind: 'namespace_member.upsert';
      namespace_id: string;
      principal: CanonicalPrincipalDto;
      role: NamespaceMemberRole;
    })
  | (CollaborationCommandBase & {
      kind: 'namespace_member.revoke';
      namespace_id: string;
      membership_id: string;
    })
  | (CollaborationCommandBase & {
      kind: 'project_guest.grant';
      namespace_id: string;
      project_id: string;
      principal: CanonicalPrincipalDto;
      role: ProjectGrantRole;
      expires_at: string | null;
    })
  | (CollaborationCommandBase & {
      kind: 'project_guest.revoke';
      namespace_id: string;
      project_id: string;
      grant_id: string;
    })
  | (CollaborationCommandBase & {
      kind: 'project.transfer';
      project_id: string;
      source_namespace_id: string;
      target_namespace_id: string;
    })
  | (CollaborationCommandBase &
      (
        | {
            kind: 'invitation.create';
            target: Extract<CollaborationInvitationTarget, { kind: 'namespace' }>;
            recipient: { user_id: string | null; email: string | null };
            role: NamespaceMemberRole;
            token_hash: string;
            expires_at: string;
          }
        | {
            kind: 'invitation.create';
            target: Extract<CollaborationInvitationTarget, { kind: 'project' }>;
            recipient: { user_id: string | null; email: string | null };
            role: ProjectGrantRole;
            token_hash: string;
            expires_at: string;
          }
      ))
  | (CollaborationCommandBase & {
      kind: 'invitation.accept';
      actor: HumanPrincipalDto;
      token_hash: string;
      verified_emails: readonly string[];
    })
  | (CollaborationCommandBase & {
      kind: 'invitation.revoke';
      namespace_id: string;
      invitation_id: string;
    })
  | (CollaborationCommandBase & {
      kind: 'namespace_ownership.transfer';
      actor: HumanPrincipalDto;
      namespace_id: string;
      current_owner_membership_id: string;
      target_membership_id: string;
    });

export type CollaborationInvariantErrorCode =
  | 'INVALID_EXPIRY'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_INACTIVE'
  | 'INVITATION_RECIPIENT_MISMATCH'
  | 'LAST_OWNER_REQUIRED'
  | 'NAMESPACE_MISMATCH'
  | 'OWNER_COUNT_INVALID'
  | 'SAME_NAMESPACE'
  | 'SAME_OWNER'
  | 'CURRENT_OWNER_INELIGIBLE'
  | 'TARGET_OWNER_INELIGIBLE';

export class CollaborationInvariantError extends Error {
  constructor(
    readonly code: CollaborationInvariantErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'CollaborationInvariantError';
  }
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Validate a nullable guest-grant expiry against the server clock. */
export function assertProjectGrantExpiry(input: {
  expires_at: string | null;
  evaluated_at: string;
}): void {
  if (input.expires_at === null) return;
  const expiresAt = timestamp(input.expires_at);
  const evaluatedAt = timestamp(input.evaluated_at);
  if (expiresAt === null || evaluatedAt === null || expiresAt <= evaluatedAt) {
    throw new CollaborationInvariantError(
      'INVALID_EXPIRY',
      'Project grant expiry must be a valid timestamp after the server evaluation time'
    );
  }
}

/**
 * Enforce the last-owner invariant after the namespace authority row is locked.
 * Storage adapters must count active human owners in the same transaction.
 */
export function assertOwnerMutationAllowed(input: {
  target: NamespaceMembershipDto;
  active_human_owner_count: number;
}): void {
  if (!Number.isSafeInteger(input.active_human_owner_count) || input.active_human_owner_count < 0) {
    throw new CollaborationInvariantError(
      'OWNER_COUNT_INVALID',
      'Active human owner count must be a non-negative integer'
    );
  }
  const removesActiveOwner =
    input.target.status === 'active' &&
    input.target.role === 'owner' &&
    input.target.principal.kind === 'human';
  if (removesActiveOwner && input.active_human_owner_count <= 1) {
    throw new CollaborationInvariantError(
      'LAST_OWNER_REQUIRED',
      'A namespace must retain at least one active human owner'
    );
  }
}

export interface NamespaceOwnershipTransferPlan {
  namespace_id: string;
  demote: { membership_id: string; role: 'admin' };
  promote: { membership_id: string; role: 'owner' };
}

export interface ProjectTransferPlan {
  project_id: string;
  source_namespace_id: string;
  target_namespace_id: string;
}

/** Bind a project move to its current namespace for compare-and-set storage. */
export function buildProjectTransferPlan(input: ProjectTransferPlan): ProjectTransferPlan {
  if (input.source_namespace_id === input.target_namespace_id) {
    throw new CollaborationInvariantError(
      'SAME_NAMESPACE',
      'Project transfer requires a different target namespace'
    );
  }
  return { ...input };
}

/** Build the two writes that a storage adapter must apply atomically. */
export function buildNamespaceOwnershipTransferPlan(input: {
  namespace_id: string;
  current_owner: NamespaceMembershipDto;
  target: NamespaceMembershipDto;
}): NamespaceOwnershipTransferPlan {
  if (
    input.current_owner.namespace_id !== input.namespace_id ||
    input.target.namespace_id !== input.namespace_id
  ) {
    throw new CollaborationInvariantError(
      'NAMESPACE_MISMATCH',
      'Ownership transfer memberships must belong to the same namespace'
    );
  }
  if (input.current_owner.membership_id === input.target.membership_id) {
    throw new CollaborationInvariantError(
      'SAME_OWNER',
      'Ownership transfer requires a different target membership'
    );
  }
  if (
    input.current_owner.status !== 'active' ||
    input.current_owner.role !== 'owner' ||
    input.current_owner.principal.kind !== 'human'
  ) {
    throw new CollaborationInvariantError(
      'CURRENT_OWNER_INELIGIBLE',
      'Current owner must be an active human owner'
    );
  }
  if (
    input.target.status !== 'active' ||
    input.target.role === 'owner' ||
    input.target.principal.kind !== 'human'
  ) {
    throw new CollaborationInvariantError(
      'TARGET_OWNER_INELIGIBLE',
      'Target owner must be a different active human non-owner member'
    );
  }
  return {
    namespace_id: input.namespace_id,
    demote: { membership_id: input.current_owner.membership_id, role: 'admin' },
    promote: { membership_id: input.target.membership_id, role: 'owner' },
  };
}

/** Validate a pending invitation against its recipient binding and server clock. */
export function assertInvitationMayBeAccepted(input: {
  invitation: CollaborationInvitationDto;
  actor: HumanPrincipalDto;
  verified_emails: readonly string[];
  evaluated_at: string;
}): void {
  if (input.invitation.status !== 'pending') {
    throw new CollaborationInvariantError(
      'INVITATION_INACTIVE',
      'Only a pending invitation may be accepted'
    );
  }
  const expiresAt = timestamp(input.invitation.expires_at);
  const evaluatedAt = timestamp(input.evaluated_at);
  if (expiresAt === null || evaluatedAt === null || expiresAt <= evaluatedAt) {
    throw new CollaborationInvariantError('INVITATION_EXPIRED', 'Invitation has expired');
  }

  const recipient = input.invitation.recipient;
  const userMatches = recipient.user_id === null || recipient.user_id === input.actor.principal_id;
  const verifiedEmails = new Set(input.verified_emails.map(normalizedEmail));
  const emailMatches =
    recipient.email === null || verifiedEmails.has(normalizedEmail(recipient.email));
  if (!userMatches || !emailMatches || (recipient.user_id === null && recipient.email === null)) {
    throw new CollaborationInvariantError(
      'INVITATION_RECIPIENT_MISMATCH',
      'Invitation recipient does not match the authenticated user'
    );
  }
}

export interface CollaborationLifecycleTransaction {
  /** Serialize lifecycle writes for one namespace before counting owners. */
  lockNamespace(namespaceId: string): Promise<void>;
  findNamespaceMembershipForUpdate(input: {
    namespaceId: string;
    membershipId: string;
  }): Promise<NamespaceMembershipDto | null>;
  countActiveHumanOwnersForUpdate(namespaceId: string): Promise<number>;
  upsertNamespaceMembership(input: {
    namespaceId: string;
    principal: CanonicalPrincipalDto;
    role: NamespaceMemberRole;
  }): Promise<NamespaceMembershipDto>;
  revokeNamespaceMembership(membershipId: string, revokedAt: string): Promise<void>;
  upsertProjectGrant(input: {
    namespaceId: string;
    projectId: string;
    principal: CanonicalPrincipalDto;
    role: ProjectGrantRole;
    expiresAt: string | null;
  }): Promise<ProjectGrantDto>;
  findProjectGrantForUpdate(input: {
    namespaceId: string;
    projectId: string;
    grantId: string;
  }): Promise<ProjectGrantDto | null>;
  revokeProjectGrant(grantId: string, revokedAt: string): Promise<void>;
  applyProjectTransfer(plan: ProjectTransferPlan): Promise<void>;
  createInvitation(invitation: StoredCollaborationInvitationDto): Promise<void>;
  findInvitationByTokenHashForUpdate(tokenHash: string): Promise<CollaborationInvitationDto | null>;
  acceptInvitation(input: {
    invitationId: string;
    acceptedByUserId: string;
    acceptedAt: string;
  }): Promise<void>;
  revokeInvitation(invitationId: string, revokedAt: string): Promise<void>;
  applyOwnershipTransfer(plan: NamespaceOwnershipTransferPlan, updatedAt: string): Promise<void>;
}

/** Composition-root port; every callback must commit or roll back as one unit. */
export interface CollaborationLifecycleUnitOfWork {
  transaction<Result>(
    operation: (transaction: CollaborationLifecycleTransaction) => Promise<Result>
  ): Promise<Result>;
}
