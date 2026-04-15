/**
 * Events outbox table — cross-process realtime sync.
 *
 * Writers INSERT into this table (often via triggers); readers SELECT
 * and relay to LISTEN/NOTIFY subscribers. See
 * docs/superpowers/plans/2026-04-15-realtime-sync-mcp.md.
 */

import { sql } from 'drizzle-orm';
import { bigserial, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const events = pgTable(
  'events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    type: text('type').notNull(),
    projectId: text('project_id').notNull(),
    conversationId: text('conversation_id'),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => ({
    byProject: index('events_project_id_idx').on(t.projectId, t.id),
    byConversation: index('events_conversation_id_idx').on(t.conversationId, t.id),
    byCreatedAt: index('events_created_at_idx').on(t.createdAt),
  })
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
