/**
 * Frame State Tables
 *
 * Source-of-truth for current frame state per conversation.
 * Delta log remains as audit trail; these tables hold the latest snapshot.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { conversations, projects } from './schema';

// ── Frames ──

export const frames = pgTable(
  'frames',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.conversationId, { onDelete: 'cascade' }),
    frameId: text('frame_id').notNull(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    topicId: text('topic_id'),
    type: text('type').notNull(),
    slots: jsonb('slots').notNull(),
    status: text('status').notNull().default('active'),
    confidence: real('confidence'),
    source: text('source').notNull(),
    slotSources: jsonb('slot_sources'),
    manualEdited: boolean('manual_edited').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.conversationId, table.frameId] }),
    projectIdx: index('idx_frames_project').on(table.projectId),
    typeIdx: index('idx_frames_type').on(table.type),
    topicIdx: index('idx_frames_conv_topic').on(table.conversationId, table.topicId),
    manualIdx: index('idx_frames_manual')
      .on(table.conversationId, table.manualEdited)
      .where(sql`manual_edited = true`),
  })
);

export type FrameRecord = typeof frames.$inferSelect;
export type FrameInsert = typeof frames.$inferInsert;

// ── Frame Relations ──

export const frameRelations = pgTable(
  'frame_relations',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.conversationId, { onDelete: 'cascade' }),
    topicId: text('topic_id'),
    fromFrameId: text('from_frame_id').notNull(),
    toFrameId: text('to_frame_id').notNull(),
    type: text('type').notNull(),
    confidence: real('confidence'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    convIdx: index('idx_frel_conversation').on(table.conversationId),
    topicIdx: index('idx_frel_topic').on(table.conversationId, table.topicId),
    fromIdx: index('idx_frel_from').on(table.fromFrameId),
    toIdx: index('idx_frel_to').on(table.toFrameId),
  })
);

export type FrameRelationRecord = typeof frameRelations.$inferSelect;
export type FrameRelationInsert = typeof frameRelations.$inferInsert;
