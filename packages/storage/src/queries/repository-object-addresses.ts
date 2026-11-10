import { sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';

export type RepositoryObjectKind = 'commit' | 'review' | 'validation' | 'schema';

export interface RepositoryObjectAddress extends Record<string, unknown> {
  id: string;
  number: string;
}

export async function findRepositoryObjectAddress(
  db: AnyDB,
  projectId: string,
  kind: RepositoryObjectKind,
  key: { id: string } | { number: string }
): Promise<RepositoryObjectAddress | null> {
  const match = 'id' in key ? sql`object_id = ${key.id}` : sql`number = ${key.number}::bigint`;
  const result = await db.execute<RepositoryObjectAddress>(sql`
    SELECT object_id AS id, number::text
    FROM repository_object_addresses
    WHERE project_id = ${projectId} AND kind = ${kind} AND ${match}
  `);
  return result[0] ?? null;
}

export async function listRepositoryObjectAddresses(
  db: AnyDB,
  projectId: string,
  kind: RepositoryObjectKind,
  ids: string[]
): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const result = await db.execute<RepositoryObjectAddress>(sql`
    SELECT object_id AS id, number::text
    FROM repository_object_addresses
    WHERE project_id = ${projectId} AND kind = ${kind}
      AND object_id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `
      )})
  `);
  return new Map(result.map(({ id, number }) => [id, number]));
}
