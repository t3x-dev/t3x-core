import { and, asc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type SchemaStudioCandidateRecord, schemaStudioCandidates } from '../schema-studio';
export async function listSchemaStudioCandidates(db: AnyDB, projectId: string) {
  return db
    .select()
    .from(schemaStudioCandidates)
    .where(eq(schemaStudioCandidates.projectId, projectId))
    .orderBy(asc(schemaStudioCandidates.createdAt), asc(schemaStudioCandidates.id));
}
export async function findSchemaStudioCandidate(db: AnyDB, projectId: string, id: string) {
  const [row] = await db
    .select()
    .from(schemaStudioCandidates)
    .where(and(eq(schemaStudioCandidates.projectId, projectId), eq(schemaStudioCandidates.id, id)))
    .limit(1);
  return row ?? null;
}
export async function addSchemaStudioCandidate(
  db: AnyDB,
  input: Omit<SchemaStudioCandidateRecord, 'createdAt'>
) {
  await db.insert(schemaStudioCandidates).values(input).onConflictDoNothing();
  return (await findSchemaStudioCandidate(db, input.projectId, input.id))!;
}
export async function removeSchemaStudioCandidate(db: AnyDB, projectId: string, id: string) {
  await db
    .delete(schemaStudioCandidates)
    .where(and(eq(schemaStudioCandidates.projectId, projectId), eq(schemaStudioCandidates.id, id)));
}
