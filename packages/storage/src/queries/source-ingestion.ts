import { and, eq, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { sourceIngestionReceipts } from '../schema';

interface SourceIngestionKey {
  projectId: string;
  actorId: string;
  requestId: string;
}

export class SourceIngestionConflictError extends Error {}

export async function findSourceIngestionReceipt(db: AnyDB, key: SourceIngestionKey) {
  const [receipt] = await db
    .select()
    .from(sourceIngestionReceipts)
    .where(
      and(
        eq(sourceIngestionReceipts.projectId, key.projectId),
        eq(sourceIngestionReceipts.actorId, key.actorId),
        eq(sourceIngestionReceipts.requestId, key.requestId)
      )
    );
  return receipt ?? null;
}

export function transactSourceIngestion(
  db: AnyDB,
  key: SourceIngestionKey,
  requestDigest: string,
  write: (tx: AnyDB) => Promise<Record<string, unknown>>
) {
  return db.transaction(async (transaction) => {
    const tx: AnyDB = transaction;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(5458243, hashtext(${JSON.stringify([key.projectId, key.actorId, key.requestId])}))`
    );
    const existing = await findSourceIngestionReceipt(tx, key);
    if (existing) {
      if (existing.requestDigest !== requestDigest) {
        throw new SourceIngestionConflictError(
          'Source ingestion request ID already has different input.'
        );
      }
      return existing;
    }
    const result = await write(tx);
    const [receipt] = await tx
      .insert(sourceIngestionReceipts)
      .values({
        ...key,
        requestDigest,
        result,
      })
      .returning();
    return receipt!;
  });
}
