import { and, eq, isNull } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { namespaces, projects, repositoryPaths } from '../schema';

export async function findRepositoryClaim(db: AnyDB, namespaceId: string, name: string) {
  const [claim] = await db
    .select()
    .from(repositoryPaths)
    .where(
      and(
        eq(repositoryPaths.namespaceId, namespaceId),
        eq(repositoryPaths.nameKey, name.toLowerCase())
      )
    );
  return claim ?? null;
}

/** Exact indexed address lookup, independent of lists and pagination. */
export async function resolveRepositoryProject(db: AnyDB, owner: string, name: string) {
  const [row] = await db
    .select({ project: projects })
    .from(repositoryPaths)
    .innerJoin(namespaces, eq(namespaces.namespaceId, repositoryPaths.namespaceId))
    .innerJoin(projects, eq(projects.projectId, repositoryPaths.projectId))
    .where(
      and(
        eq(namespaces.slug, owner.toLowerCase()),
        eq(repositoryPaths.nameKey, name.toLowerCase()),
        eq(repositoryPaths.resolvable, true),
        isNull(projects.deletedAt)
      )
    );
  return row?.project ?? null;
}

export async function getRepositoryAddress(
  db: AnyDB,
  project: { projectId: string; name: string; namespaceId?: string | null }
) {
  if (!project.namespaceId)
    return { namespace: null, canonical_path: null, path_status: 'pending_migration' as const };
  const [row] = await db
    .select({
      slug: namespaces.slug,
      claimedBy: repositoryPaths.projectId,
      resolvable: repositoryPaths.resolvable,
    })
    .from(namespaces)
    .leftJoin(
      repositoryPaths,
      and(
        eq(repositoryPaths.namespaceId, namespaces.namespaceId),
        eq(repositoryPaths.nameKey, project.name.toLowerCase())
      )
    )
    .where(eq(namespaces.namespaceId, project.namespaceId));
  const ready = row?.claimedBy === project.projectId && row.resolvable === true;
  return {
    namespace: row?.slug ?? null,
    canonical_path: ready ? `/${row.slug}/${project.name}` : null,
    path_status: ready ? ('ready' as const) : ('pending_migration' as const),
  };
}

/** Walk Drizzle's cause chain without exposing SQL or private row details. */
export function repositoryPathError(error: unknown): {
  code: 'NAME_OCCUPIED' | 'NAME_RESERVED' | 'NAME_INVALID';
  message: string;
  status: 400 | 409;
} | null {
  let current = error;
  for (let depth = 0; current && typeof current === 'object' && depth < 8; depth++) {
    const item = current as { constraint_name?: string; cause?: unknown };
    if (item.constraint_name === 'repository_path_occupied')
      return {
        code: 'NAME_OCCUPIED',
        message: 'This repository name is already occupied in this namespace.',
        status: 409,
      };
    if (item.constraint_name === 'repository_name_reserved')
      return { code: 'NAME_RESERVED', message: 'This repository name is reserved.', status: 400 };
    if (item.constraint_name === 'repository_name_valid')
      return {
        code: 'NAME_INVALID',
        message: 'A confirmed repository name of 1-100 ASCII characters is required.',
        status: 400,
      };
    current = item.cause;
  }
  return null;
}
