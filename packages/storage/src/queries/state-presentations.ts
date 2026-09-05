import { and, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { statePresentations } from '../schema-presentations';
export async function findStatePresentation(db: AnyDB, projectId: string, commitDigest: string) {
  const [row] = await db
    .select()
    .from(statePresentations)
    .where(
      and(
        eq(statePresentations.projectId, projectId),
        eq(statePresentations.commitDigest, commitDigest)
      )
    )
    .limit(1);
  return row ?? null;
}
/** First publication wins; idempotent repeats do not replace historical author content. */
export async function insertStatePresentation(
  db: AnyDB,
  input: typeof statePresentations.$inferInsert
) {
  await db.insert(statePresentations).values(input).onConflictDoNothing();
  return (await findStatePresentation(db, input.projectId, input.commitDigest))!;
}
