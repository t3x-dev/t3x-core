import { jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
export const statePresentations = pgTable(
  'state_presentations',
  {
    projectId: text('project_id').notNull(),
    commitDigest: text('commit_digest').notNull(),
    presentationDigest: text('presentation_digest').notNull(),
    document: jsonb('document').notNull().$type<Record<string, unknown>>(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.commitDigest] })]
);
