import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type Namespace, namespaces } from '../schema';
import { namespaceMemberships } from '../schema-trees';

export const DEFAULT_ORGANIZATION_NAMESPACE_ID = 'ns_t3x_dev';
export const DEFAULT_ORGANIZATION_NAMESPACE_SLUG = 't3x-dev';

export async function findNamespaceBySlug(db: AnyDB, slug: string): Promise<Namespace | null> {
  const [namespace] = await db.select().from(namespaces).where(eq(namespaces.slug, slug)).limit(1);
  return namespace ?? null;
}

export async function findNamespaceById(db: AnyDB, namespaceId: string): Promise<Namespace | null> {
  const [namespace] = await db
    .select()
    .from(namespaces)
    .where(eq(namespaces.namespaceId, namespaceId))
    .limit(1);
  return namespace ?? null;
}

export async function findPersonalNamespaceByOwner(
  db: AnyDB,
  ownerUserId: string
): Promise<Namespace | null> {
  const [namespace] = await db
    .select()
    .from(namespaces)
    .where(and(eq(namespaces.ownerUserId, ownerUserId), eq(namespaces.kind, 'personal')))
    .limit(1);
  return namespace ?? null;
}

export async function insertPersonalNamespace(
  db: AnyDB,
  input: { slug: string; ownerUserId?: string; displayName?: string }
): Promise<Namespace> {
  return db.transaction(async (tx) => {
    const [namespace] = await tx
      .insert(namespaces)
      .values({
        namespaceId: `ns_${randomUUID().replaceAll('-', '')}`,
        slug: input.slug,
        kind: 'personal',
        ownerUserId: input.ownerUserId ?? null,
        displayName: input.displayName ?? input.slug,
      })
      .returning();

    if (input.ownerUserId) {
      await tx.insert(namespaceMemberships).values({
        membershipId: `nsm_${randomUUID().replaceAll('-', '')}`,
        namespaceId: namespace.namespaceId,
        principalKind: 'human',
        principalId: input.ownerUserId,
        role: 'owner',
        status: 'active',
      });
    }

    return namespace;
  });
}
