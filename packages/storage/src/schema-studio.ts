import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
export const schemaStudioCandidates = pgTable('schema_studio_candidates', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  sourceProjectId: text('source_project_id'),
  canonicalName: text('canonical_name').notNull(),
  version: text('version').notNull(),
  artifactVersionId: text('artifact_version_id').notNull(),
  artifactHash: text('artifact_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export type SchemaStudioCandidateRecord = typeof schemaStudioCandidates.$inferSelect;
