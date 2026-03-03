/**
 * Observable Metrics Schema (Drizzle ORM)
 *
 * Stores metric events for tracking system behaviour:
 * - suggestion_coverage
 * - confirmation
 * - diff_override
 * - merge_time
 *
 * Part of S17 Observable Metrics feature.
 */

import { index, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';
import { projects } from './schema';

export const metricsEvents = pgTable(
  'metrics_events',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(), // suggestion_coverage | confirmation | diff_override | merge_time
    value: real('value').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index('idx_metrics_events_project').on(table.projectId),
    eventTypeIdx: index('idx_metrics_events_type').on(table.eventType),
    createdAtIdx: index('idx_metrics_events_created_at').on(table.createdAt),
  })
);

export type MetricsEventRecord = typeof metricsEvents.$inferSelect;
export type MetricsEventInsert = typeof metricsEvents.$inferInsert;
