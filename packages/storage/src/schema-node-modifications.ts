/**
 * Node Modifications Schema (Audit Trail)
 *
 * Tracks when semantic points are modified via the review-action endpoint.
 * Records the action taken (edit, undo, delete, accept), before/after text,
 * and the actor who performed the change.
 */

import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const nodeModifications = pgTable(
  'node_modifications',
  {
    id: text('id').primaryKey(), // smod_{nanoid}
    /**
     * Fix 15 (no-fk note): No foreign key to drafts is declared here.
     * The node_modifications table is an audit trail that intentionally
     * outlives its parent draft — users may delete a draft but still want to
     * retain the modification history for audit purposes. If cascade-delete
     * semantics are required in the future, add:
     *   .references(() => drafts.id, { onDelete: 'cascade' })
     * and import drafts from './schema-trees'.
     */
    draftId: text('draft_id').notNull(),
    spId: text('sp_id').notNull(),
    action: text('action').notNull(), // 'edit' | 'undo' | 'delete' | 'accept'
    previousText: text('previous_text'),
    newText: text('new_text'),
    actor: text('actor').notNull(), // 'user' | 'system'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_nmod_draft').on(table.draftId), index('idx_nmod_sp').on(table.spId)]
);

export type NodeModificationRecord = typeof nodeModifications.$inferSelect;
export type NodeModificationInsert = typeof nodeModifications.$inferInsert;
