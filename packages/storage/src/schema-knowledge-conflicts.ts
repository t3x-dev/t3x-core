/**
 * Knowledge Conflicts Schema (S15)
 *
 * Persists detected conflicts between new and existing sentences.
 * Used for conflict detection, resolution tracking, and knowledge integrity.
 */

import { index, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';
import { projects } from './schema';

export const knowledgeConflicts = pgTable(
  'knowledge_conflicts',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    newSentenceId: text('new_sentence_id').notNull(),
    newCommitHash: text('new_commit_hash').notNull(),
    existingSentenceId: text('existing_sentence_id').notNull(),
    existingCommitHash: text('existing_commit_hash').notNull(),
    cosine: real('cosine').notNull(),
    jaccard: real('jaccard').notNull(),
    status: text('status').notNull().default('open'), // open | resolved | dismissed
    resolution: text('resolution'), // kept_new | kept_existing | merged | dismissed
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_knowledge_conflicts_project').on(table.projectId),
    index('idx_knowledge_conflicts_status').on(table.status),
  ]
);

export type KnowledgeConflictRecord = typeof knowledgeConflicts.$inferSelect;
export type KnowledgeConflictInsert = typeof knowledgeConflicts.$inferInsert;
