import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { AnyDB } from '../adapters';

const selections = pgTable('mcp_preselections', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  projectId: text('project_id').notNull(),
  clientId: text('client_id').notNull(),
  branch: text('branch').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  claimedBy: text('claimed_by'),
});

const fields = {
  id: selections.id,
  userId: selections.userId,
  projectId: selections.projectId,
  clientId: selections.clientId,
  branch: selections.branch,
  expiresAt: selections.expiresAt,
};
export type McpPreselection = Omit<typeof selections.$inferSelect, 'claimedBy'>;
type SelectionTarget = Pick<McpPreselection, 'userId' | 'projectId' | 'clientId' | 'branch'>;
const available = () =>
  and(isNull(selections.claimedBy), gt(selections.expiresAt, sql`clock_timestamp()`));

export class McpPreselectionLimitError extends Error {
  constructor() {
    super('Too many saved Agent selections. Try again after an existing selection expires.');
  }
}

export async function createMcpPreselection(
  db: AnyDB,
  target: SelectionTarget
): Promise<McpPreselection> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${target.userId}, 93))`);
    const [admission] = await tx.execute<{ limited: boolean }>(sql`
      SELECT count(*) >= 100 AS limited FROM mcp_preselections
      WHERE user_id=${target.userId} AND expires_at > clock_timestamp()
    `);
    if (admission.limited) throw new McpPreselectionLimitError();
    await tx.execute(sql`
      DELETE FROM mcp_preselections WHERE id IN (
        SELECT id FROM mcp_preselections WHERE expires_at <= clock_timestamp()
        ORDER BY expires_at LIMIT 64 FOR UPDATE SKIP LOCKED
      )
    `);
    const [item] = await tx
      .insert(selections)
      .values({
        ...target,
        id: randomUUID(),
        expiresAt: sql`clock_timestamp() + interval '15 minutes'`,
      })
      .returning(fields);
    return item;
  });
}

export async function readMcpPreselection(
  db: AnyDB,
  id: string,
  userId: string
): Promise<McpPreselection | null> {
  const [item] = await db
    .select(fields)
    .from(selections)
    .where(and(eq(selections.id, id), eq(selections.userId, userId), available()));
  return item ?? null;
}

export function listMcpPreselections(
  db: AnyDB,
  userId: string,
  clientId: string
): Promise<McpPreselection[]> {
  return db
    .select(fields)
    .from(selections)
    .where(and(eq(selections.userId, userId), eq(selections.clientId, clientId), available()))
    .orderBy(selections.expiresAt, selections.id);
}

export async function claimMcpPreselection(
  tx: AnyDB,
  input: SelectionTarget & { id: string; attemptId: string }
): Promise<boolean> {
  const claimed = await tx
    .update(selections)
    .set({ claimedBy: input.attemptId })
    .where(
      and(
        eq(selections.id, input.id),
        eq(selections.userId, input.userId),
        eq(selections.clientId, input.clientId),
        eq(selections.projectId, input.projectId),
        eq(selections.branch, input.branch),
        available()
      )
    )
    .returning({ id: selections.id });
  return claimed.length === 1;
}
