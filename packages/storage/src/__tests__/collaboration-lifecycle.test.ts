import type { CollaborationLifecycleUnitOfWork } from '@t3x-dev/application';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  type CollaborationStorageError,
  createPostgresCollaborationLifecycleUnitOfWork,
} from '../queries/collaboration-lifecycle';
import { insertPersonalNamespace } from '../queries/namespaces';
import { findProjectById, insertProject } from '../queries/projects';
import { namespaceMemberships, projectGrants, users } from '../schema-trees';
import { createTestDB } from './setup';

const CREATED_AT = '2026-08-31T00:00:00.000Z';
const UPDATED_AT = '2026-08-31T00:01:00.000Z';
const EXPIRES_AT = '2099-01-01T00:00:00.000Z';

describe('PostgreSQL collaboration lifecycle unit of work', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  function unitOfWork(): CollaborationLifecycleUnitOfWork {
    // Compile-time proof that storage remains structurally compatible with the
    // application port without introducing a runtime package dependency.
    return createPostgresCollaborationLifecycleUnitOfWork(db);
  }

  it('commits lifecycle writes together and rolls them back together', async () => {
    const namespace = await insertPersonalNamespace(db, {
      slug: 'collaboration-rollback',
      ownerUserId: 'user_collaboration_rollback_owner',
    });

    await expect(
      unitOfWork().transaction(async (transaction) => {
        await transaction.lockNamespace(namespace.namespaceId);
        await transaction.upsertNamespaceMembership({
          namespaceId: namespace.namespaceId,
          principal: { kind: 'human', principal_id: 'user_rolled_back' },
          role: 'editor',
        });
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');

    const rows = await db
      .select()
      .from(namespaceMemberships)
      .where(eq(namespaceMemberships.principalId, 'user_rolled_back'));
    expect(rows).toHaveLength(0);
  });

  it('upserts and revokes namespace membership and project grants', async () => {
    const namespace = await insertPersonalNamespace(db, {
      slug: 'collaboration-members',
      ownerUserId: 'user_collaboration_members_owner',
    });
    const project = await insertProject(db, {
      name: 'Collaboration member project',
      namespaceId: namespace.namespaceId,
    });

    const result = await unitOfWork().transaction(async (transaction) => {
      await transaction.lockNamespace(namespace.namespaceId);
      const owners = await transaction.countActiveHumanOwnersForUpdate(namespace.namespaceId);
      const member = await transaction.upsertNamespaceMembership({
        namespaceId: namespace.namespaceId,
        principal: { kind: 'human', principal_id: 'user_collaborator' },
        role: 'editor',
      });
      const grant = await transaction.upsertProjectGrant({
        namespaceId: namespace.namespaceId,
        projectId: project.projectId,
        principal: { kind: 'service', principal_id: 'service_collaborator' },
        role: 'viewer',
        expiresAt: EXPIRES_AT,
      });
      return { grant, member, owners };
    });

    expect(result.owners).toBe(1);
    expect(result.member).toMatchObject({ role: 'editor', status: 'active' });
    expect(result.grant).toMatchObject({ role: 'viewer', status: 'active' });

    await unitOfWork().transaction(async (transaction) => {
      await transaction.lockNamespace(namespace.namespaceId);
      await transaction.revokeNamespaceMembership(result.member.membership_id, UPDATED_AT);
      await transaction.revokeProjectGrant(result.grant.grant_id, UPDATED_AT);
    });

    const [member] = await db
      .select()
      .from(namespaceMemberships)
      .where(eq(namespaceMemberships.membershipId, result.member.membership_id));
    const [grant] = await db
      .select()
      .from(projectGrants)
      .where(eq(projectGrants.grantId, result.grant.grant_id));
    expect(member).toMatchObject({ status: 'revoked' });
    expect(grant).toMatchObject({ status: 'revoked' });
  });

  it('keeps invitation token hashes internal and enforces state transitions', async () => {
    const namespace = await insertPersonalNamespace(db, {
      slug: 'collaboration-invitations',
      ownerUserId: 'user_collaboration_invitation_owner',
    });
    await db
      .insert(users)
      .values({ id: 'user_invitation_recipient', email: 'invitee@example.com' });

    const invitation = {
      invitation_id: 'inv_collaboration_accept',
      target: { kind: 'namespace' as const, namespace_id: namespace.namespaceId, project_id: null },
      recipient: { user_id: 'user_invitation_recipient', email: 'invitee@example.com' },
      role: 'viewer' as const,
      token_hash: 'sha256:collaboration-accept',
      status: 'pending' as const,
      created_by: { kind: 'human' as const, principal_id: 'user_collaboration_invitation_owner' },
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
      expires_at: EXPIRES_AT,
      accepted_at: null,
      accepted_by_user_id: null,
      revoked_at: null,
      expired_at: null,
    };

    const safeInvitation = await unitOfWork().transaction(async (transaction) => {
      await transaction.lockNamespace(namespace.namespaceId);
      await transaction.createInvitation(invitation);
      return transaction.findInvitationByTokenHashForUpdate(invitation.token_hash);
    });
    expect(safeInvitation).toMatchObject({ invitation_id: invitation.invitation_id });
    expect(safeInvitation).not.toHaveProperty('token_hash');

    await unitOfWork().transaction(async (transaction) => {
      await transaction.lockNamespace(namespace.namespaceId);
      await transaction.acceptInvitation({
        invitationId: invitation.invitation_id,
        acceptedByUserId: 'user_invitation_recipient',
        acceptedAt: UPDATED_AT,
      });
    });

    await expect(
      unitOfWork().transaction(async (transaction) => {
        await transaction.lockNamespace(namespace.namespaceId);
        await transaction.acceptInvitation({
          invitationId: invitation.invitation_id,
          acceptedByUserId: 'user_invitation_recipient',
          acceptedAt: UPDATED_AT,
        });
      })
    ).rejects.toMatchObject<Partial<CollaborationStorageError>>({
      code: 'INVITATION_STATE_CONFLICT',
    });
  });

  it('transfers namespace ownership atomically', async () => {
    const namespace = await insertPersonalNamespace(db, {
      slug: 'collaboration-ownership',
      ownerUserId: 'user_current_owner',
    });
    const [currentOwner] = await db
      .select()
      .from(namespaceMemberships)
      .where(eq(namespaceMemberships.principalId, 'user_current_owner'));

    await unitOfWork().transaction(async (transaction) => {
      await transaction.lockNamespace(namespace.namespaceId);
      const target = await transaction.upsertNamespaceMembership({
        namespaceId: namespace.namespaceId,
        principal: { kind: 'human', principal_id: 'user_next_owner' },
        role: 'admin',
      });
      await transaction.applyOwnershipTransfer(
        {
          namespace_id: namespace.namespaceId,
          demote: { membership_id: currentOwner.membershipId, role: 'admin' },
          promote: { membership_id: target.membership_id, role: 'owner' },
        },
        UPDATED_AT
      );
    });

    const memberships = await db
      .select()
      .from(namespaceMemberships)
      .where(eq(namespaceMemberships.namespaceId, namespace.namespaceId));
    expect(memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ principalId: 'user_current_owner', role: 'admin' }),
        expect.objectContaining({ principalId: 'user_next_owner', role: 'owner' }),
      ])
    );
  });

  it('moves clean projects and fails closed when collaboration history exists', async () => {
    const source = await insertPersonalNamespace(db, { slug: 'collaboration-transfer-source' });
    const target = await insertPersonalNamespace(db, { slug: 'collaboration-transfer-target' });
    const cleanProject = await insertProject(db, {
      name: 'Clean transfer',
      namespaceId: source.namespaceId,
    });

    await unitOfWork().transaction((transaction) =>
      transaction.applyProjectTransfer({
        project_id: cleanProject.projectId,
        source_namespace_id: source.namespaceId,
        target_namespace_id: target.namespaceId,
      })
    );
    await expect(findProjectById(db, cleanProject.projectId)).resolves.toMatchObject({
      namespaceId: target.namespaceId,
    });

    const guardedProject = await insertProject(db, {
      name: 'Guarded transfer',
      namespaceId: source.namespaceId,
    });
    await unitOfWork().transaction(async (transaction) => {
      await transaction.lockNamespace(source.namespaceId);
      await transaction.upsertProjectGrant({
        namespaceId: source.namespaceId,
        projectId: guardedProject.projectId,
        principal: { kind: 'human', principal_id: 'user_project_guest' },
        role: 'viewer',
        expiresAt: null,
      });
    });

    await expect(
      unitOfWork().transaction((transaction) =>
        transaction.applyProjectTransfer({
          project_id: guardedProject.projectId,
          source_namespace_id: source.namespaceId,
          target_namespace_id: target.namespaceId,
        })
      )
    ).rejects.toMatchObject<Partial<CollaborationStorageError>>({
      code: 'PROJECT_TRANSFER_BLOCKED',
    });
    await expect(findProjectById(db, guardedProject.projectId)).resolves.toMatchObject({
      namespaceId: source.namespaceId,
    });
  });
});
