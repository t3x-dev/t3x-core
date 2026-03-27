/**
 * Node Modification Queries (Audit Trail)
 *
 * CRUD operations for tracking semantic point modifications.
 * Records every review action (accept, edit, undo, delete) for audit purposes.
 */

import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { nodeModifications } from '../schema-node-modifications';

export interface InsertNodeModificationInput {
  draft_id: string;
  sp_id: string;
  action: 'edit' | 'undo' | 'delete' | 'accept';
  previous_text?: string;
  new_text?: string;
  actor: string;
}

export async function insertNodeModification(
  db: AnyDB,
  input: InsertNodeModificationInput
) {
  const [row] = await db
    .insert(nodeModifications)
    .values({
      id: `smod_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      draftId: input.draft_id,
      spId: input.sp_id,
      action: input.action,
      previousText: input.previous_text ?? null,
      newText: input.new_text ?? null,
      actor: input.actor,
    })
    .returning();
  return row;
}

export async function findModificationsByDraft(db: AnyDB, draftId: string) {
  return db
    .select()
    .from(nodeModifications)
    .where(eq(nodeModifications.draftId, draftId))
    .orderBy(desc(nodeModifications.createdAt));
}
