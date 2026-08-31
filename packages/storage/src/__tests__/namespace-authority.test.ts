import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  findNamespaceMembershipForPrincipal,
  findProjectAuthorityFacts,
} from '../queries/namespace-authority';
import { insertPersonalNamespace } from '../queries/namespaces';
import { findProjects, insertProject } from '../queries/projects';
import { namespaces } from '../schema';
import { namespaceMemberships, projectGrants } from '../schema-trees';
import { createTestDB } from './setup';

describe('canonical namespace authority storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => cleanup());

  it('creates a personal namespace and owner membership atomically', async () => {
    const namespace = await insertPersonalNamespace(db, {
      slug: 'authority-owner',
      ownerUserId: 'user_authority_owner',
    });

    const membership = await findNamespaceMembershipForPrincipal(db, {
      namespaceId: namespace.namespaceId,
      principal: { kind: 'human', principalId: 'user_authority_owner' },
    });

    expect(membership).toMatchObject({
      namespaceId: namespace.namespaceId,
      principalKind: 'human',
      principalId: 'user_authority_owner',
      role: 'owner',
      status: 'active',
    });
  });

  it('loads only the exact principal facts and preserves revoked state', async () => {
    const namespace = await insertPersonalNamespace(db, {
      slug: 'authority-facts',
      ownerUserId: 'user_facts_owner',
    });
    const project = await insertProject(db, {
      name: 'Authority facts project',
      namespaceId: namespace.namespaceId,
      ownerId: 'historical_creator',
    });
    await db.insert(projectGrants).values({
      grantId: 'grant_authority_revoked',
      projectId: project.projectId,
      namespaceId: namespace.namespaceId,
      principalKind: 'human',
      principalId: 'user_revoked_guest',
      role: 'viewer',
      status: 'revoked',
      revokedAt: new Date('2026-08-30T00:00:00.000Z'),
    });

    const ownerFacts = await findProjectAuthorityFacts(db, {
      projectId: project.projectId,
      principal: { kind: 'human', principalId: 'user_facts_owner' },
    });
    expect(ownerFacts?.namespaceMembership?.role).toBe('owner');
    expect(ownerFacts?.projectGrant).toBeNull();

    const revokedFacts = await findProjectAuthorityFacts(db, {
      projectId: project.projectId,
      principal: { kind: 'human', principalId: 'user_revoked_guest' },
    });
    expect(revokedFacts?.namespaceMembership).toBeNull();
    expect(revokedFacts?.projectGrant?.status).toBe('revoked');

    const unrelatedFacts = await findProjectAuthorityFacts(db, {
      projectId: project.projectId,
      principal: { kind: 'human', principalId: 'historical_creator' },
    });
    expect(unrelatedFacts?.namespaceMembership).toBeNull();
    expect(unrelatedFacts?.projectGrant).toBeNull();
  });

  it('lists namespace projects plus exact project grants without tenant leakage', async () => {
    const memberNamespace = await insertPersonalNamespace(db, {
      slug: 'authority-list-member',
      ownerUserId: 'user_list_authority',
    });
    const otherNamespace = await insertPersonalNamespace(db, {
      slug: 'authority-list-other',
      ownerUserId: 'user_list_other',
    });
    const memberProject = await insertProject(db, {
      name: 'Member project',
      namespaceId: memberNamespace.namespaceId,
    });
    const guestProject = await insertProject(db, {
      name: 'Guest project',
      namespaceId: otherNamespace.namespaceId,
    });
    const hiddenProject = await insertProject(db, {
      name: 'Hidden project',
      namespaceId: otherNamespace.namespaceId,
    });
    const revokedProject = await insertProject(db, {
      name: 'Revoked project',
      namespaceId: otherNamespace.namespaceId,
    });
    await db.insert(projectGrants).values([
      {
        grantId: 'grant_authority_active',
        projectId: guestProject.projectId,
        namespaceId: otherNamespace.namespaceId,
        principalKind: 'human',
        principalId: 'user_list_authority',
        role: 'viewer',
        status: 'active',
      },
      {
        grantId: 'grant_authority_list_revoked',
        projectId: revokedProject.projectId,
        namespaceId: otherNamespace.namespaceId,
        principalKind: 'human',
        principalId: 'user_list_authority',
        role: 'viewer',
        status: 'revoked',
        revokedAt: new Date('2026-08-30T00:00:00.000Z'),
      },
    ]);

    const visible = await findProjects(db, {
      authority: { principal_kind: 'human', principal_id: 'user_list_authority' },
    });
    const ids = visible.map((project) => project.projectId);

    expect(ids).toContain(memberProject.projectId);
    expect(ids).toContain(guestProject.projectId);
    expect(ids).not.toContain(hiddenProject.projectId);
    expect(ids).not.toContain(revokedProject.projectId);
  });

  it('does not infer authority from namespace ownership metadata alone', async () => {
    await db.insert(namespaces).values({
      namespaceId: 'ns_metadata_only',
      slug: 'metadata-only',
      kind: 'personal',
      ownerUserId: 'user_metadata_only',
      displayName: 'Metadata only',
    });

    expect(
      await db
        .select()
        .from(namespaceMemberships)
        .where(eq(namespaceMemberships.namespaceId, 'ns_metadata_only'))
    ).toEqual([]);
    expect(
      await findNamespaceMembershipForPrincipal(db, {
        namespaceId: 'ns_metadata_only',
        principal: { kind: 'human', principalId: 'user_metadata_only' },
      })
    ).toBeNull();
  });
});
