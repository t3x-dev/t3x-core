/**
 * Tree State Tables
 *
 * Source-of-truth for current tree state per conversation.
 * Delta log remains as audit trail; these tables hold the latest snapshot.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { conversations, projects } from './schema';

// ── Trees ──

export const trees = pgTable(
  'trees',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.conversationId, { onDelete: 'cascade' }),
    treeId: text('tree_id').notNull(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    topicId: text('topic_id'),
    type: text('type').notNull(),
    slots: jsonb('slots').notNull(),
    status: text('status').notNull().default('active'),
    source: text('source').notNull(),
    slotQuotes: jsonb('slot_quotes'),
    slotSources: jsonb('slot_sources'),
    manualEdited: boolean('manual_edited').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.conversationId, table.treeId] }),
    projectIdx: index('idx_trees_project').on(table.projectId),
    typeIdx: index('idx_trees_type').on(table.type),
    topicIdx: index('idx_trees_conv_topic').on(table.conversationId, table.topicId),
    manualIdx: index('idx_trees_manual')
      .on(table.conversationId, table.manualEdited)
      .where(sql`manual_edited = true`),
  })
);

export type TreeRecord = typeof trees.$inferSelect;
export type TreeInsert = typeof trees.$inferInsert;

// ── Tree Relations ──

export const treeRelations = pgTable(
  'tree_relations',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.conversationId, { onDelete: 'cascade' }),
    topicId: text('topic_id'),
    fromTreeId: text('from_tree_id').notNull(),
    toTreeId: text('to_tree_id').notNull(),
    type: text('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    convIdx: index('idx_trel_conversation').on(table.conversationId),
    topicIdx: index('idx_trel_topic').on(table.conversationId, table.topicId),
    fromIdx: index('idx_trel_from').on(table.fromTreeId),
    toIdx: index('idx_trel_to').on(table.toTreeId),
  })
);

export type TreeRelationRecord = typeof treeRelations.$inferSelect;
export type TreeRelationInsert = typeof treeRelations.$inferInsert;
