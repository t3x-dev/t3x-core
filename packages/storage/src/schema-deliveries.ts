import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/** Delivery receipts are application evidence, never part of CommitV2 identity. */
export const workspaceDeliveries = pgTable(
  'workspace_deliveries',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    workspaceId: text('workspace_id').notNull(),
    targetId: text('target_id').notNull(),
    commitDigest: text('commit_digest').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestDigest: text('request_digest').notNull(),
    adapter: text('adapter').notNull(),
    format: text('format').notNull(),
    artifactDigest: text('artifact_digest'),
    status: text('status').notNull().$type<'prepared' | 'failed'>(),
    errorCode: text('error_code'),
    retryOf: text('retry_of'),
    attempt: integer('attempt').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('workspace_deliveries_idempotency').on(
      table.projectId,
      table.workspaceId,
      table.idempotencyKey
    ),
    index('workspace_deliveries_history').on(table.projectId, table.workspaceId, table.createdAt),
  ]
);
