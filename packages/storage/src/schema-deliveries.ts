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
    adapter: text('adapter').notNull().$type<'t3x.download/v1' | 't3x.portable/v1'>(),
    format: text('format').notNull().$type<'json' | 'yaml' | 'bundle'>(),
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

/** Append-only fixed artifact assignments for the built-in deployment slot. */
export const workspaceDeployments = pgTable(
  'workspace_deployments',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    workspaceId: text('workspace_id').notNull(),
    environment: text('environment').notNull(),
    kind: text('kind').notNull().$type<'deploy' | 'rollback'>(),
    deliveryId: text('delivery_id').notNull(),
    artifactDigest: text('artifact_digest').notNull(),
    previousArtifactDigest: text('previous_artifact_digest'),
    idempotencyKey: text('idempotency_key').notNull(),
    requestDigest: text('request_digest').notNull(),
    adapter: text('adapter').notNull().$type<'t3x.fixed-slot/v1'>(),
    desiredArtifactDigest: text('desired_artifact_digest').notNull(),
    actualArtifactDigest: text('actual_artifact_digest').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('workspace_deployments_idempotency').on(
      table.projectId,
      table.workspaceId,
      table.environment,
      table.idempotencyKey
    ),
    index('workspace_deployments_history').on(
      table.projectId,
      table.workspaceId,
      table.environment,
      table.createdAt
    ),
  ]
);
