/**
 * T3X Storage Schema (Drizzle ORM)
 *
 * PostgreSQL schema definition that works with:
 * - PGLite (local development)
 * - PostgreSQL (Docker)
 * - Supabase (cloud)
 */

import {
  customType,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

// Custom type for vector embeddings (bytea in Postgres)
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// ============================================================
// Core Tables
// ============================================================

/**
 * Projects - Top level container for conversations and commits
 */
export const projects = pgTable('projects', {
  projectId: text('project_id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  metadataJson: text('metadata_json'),
});

/**
 * Conversations - Container for turns within a project
 */
export const conversations = pgTable(
  'conversations',
  {
    conversationId: text('conversation_id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    title: text('title'),
    parentCommitHash: text('parent_commit_hash'),
    positionX: real('position_x'),
    positionY: real('position_y'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    metadataJson: text('metadata_json'),
  },
  (table) => [index('idx_conversations_project').on(table.projectId)]
);

/**
 * Turns V2 - Individual conversation turns with hash chain
 */
export const turns = pgTable(
  'turns_v2',
  {
    turnHash: text('turn_hash').primaryKey(),
    parentTurnHash: text('parent_turn_hash'),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.conversationId, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'user' | 'assistant' | 'system' | 'tool'
    content: text('content').notNull(),
    language: text('language'),
    ringsJson: text('rings_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_turns_v2_conversation').on(table.conversationId),
    index('idx_turns_v2_project').on(table.projectId),
    index('idx_turns_v2_parent').on(table.parentTurnHash),
  ]
);

/**
 * Branches - Git-like branches for versioning
 */
export const branches = pgTable(
  'branches',
  {
    branchId: text('branch_id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    parentBranch: text('parent_branch'),
    headCommitHash: text('head_commit_hash'),
    description: text('description'),
    isCurrent: integer('is_current').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('branches_project_name').on(table.projectId, table.name),
    index('idx_branches_project').on(table.projectId),
  ]
);

/**
 * Commits V2 - Semantic snapshots with hash chain (DAG)
 */
export const commits = pgTable(
  'commits_v2',
  {
    commitHash: text('commit_hash').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    branch: text('branch').notNull(),
    message: text('message'),
    parentsJson: text('parents_json').notNull(), // JSON array of parent commit hashes
    turnWindowJson: text('turn_window_json').notNull(), // { start_turn_hash, end_turn_hash }
    facetSnapshotJson: text('facet_snapshot_json').notNull(), // Semantic extraction result
    pipelineConfigJson: text('pipeline_config_json'),
    draftId: text('draft_id'),
    draftTextHash: text('draft_text_hash'),
    signatureJson: text('signature_json'),
    sourceExcerptJson: text('source_excerpt_json'),
    mustHaveJson: text('must_have_json'),
    mustntHaveJson: text('mustnt_have_json'),
    positionX: real('position_x'),
    positionY: real('position_y'),
    sourceRefsJson: text('source_refs_json'), // Multi-source references
    anchorsJson: text('anchors_json'), // v1.1: Confirmed anchors for auditing
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_commits_v2_project').on(table.projectId),
    index('idx_commits_v2_branch').on(table.branch),
    index('idx_commits_v2_draft').on(table.draftId),
  ]
);

/**
 * Drafts V2 - LLM-generated drafts pending adoption
 */
export const drafts = pgTable(
  'drafts_v2',
  {
    draftId: text('draft_id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.conversationId, { onDelete: 'cascade' }),
    baseCommitHash: text('base_commit_hash'),
    turnAnchorHash: text('turn_anchor_hash'),
    bridgeId: text('bridge_id').notNull(),
    bridgePayloadJson: text('bridge_payload_json').notNull(),
    mustHaveJson: text('must_have_json'),
    mustntHaveJson: text('mustnt_have_json'),
    llmConfigJson: text('llm_config_json').notNull(),
    text: text('text').notNull(),
    status: text('status').notNull().default('ephemeral'), // 'ephemeral' | 'adopted' | 'superseded'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_drafts_v2_project').on(table.projectId),
    index('idx_drafts_v2_base_commit').on(table.baseCommitHash),
  ]
);

/**
 * Merge Results - Cached merge computation results
 */
export const mergeResults = pgTable(
  'merge_results',
  {
    mergeResultId: text('merge_result_id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    baseCommitHash: text('base_commit_hash').notNull(),
    sourceCommitHash: text('source_commit_hash').notNull(),
    targetCommitHash: text('target_commit_hash').notNull(),
    status: text('status').notNull(), // 'clean' | 'conflicts'
    autoMergedJson: text('auto_merged_json').notNull(),
    conflictsJson: text('conflicts_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('idx_merge_results_project').on(table.projectId)]
);

/**
 * Deploy Agents - Registered agents for deployment and evaluation
 * Note: This is different from the "agent" layer (LLM draft generation)
 */
export const deployAgents = pgTable('deploy_agents', {
  deployAgentId: text('deploy_agent_id').primaryKey(),
  projectId: text('project_id')
    .references(() => projects.projectId, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  endpoint: text('endpoint').notNull(),
  type: text('type').notNull().default('http'), // 'http' | 'websocket' | 'grpc'
  authJson: text('auth_json'), // { type: 'bearer' | 'api_key', token, header? }
  status: text('status').notNull().default('idle'), // 'idle' | 'running' | 'error'
  lastRunId: text('last_run_id'),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('idx_deploy_agents_project').on(table.projectId),
]);

/**
 * Runs - Engine run records for tracking workflow executions
 *
 * v2.0: Added trace storage fields for agent evaluation
 */
export const runs = pgTable('runs', {
  runId: text('run_id').primaryKey(),
  projectId: text('project_id')
    .references(() => projects.projectId, { onDelete: 'cascade' }),
  runnerRunId: text('runner_run_id'),
  commitRef: text('commit_ref'),
  leafJson: text('leaf_json'), // { id, type, content? }
  inputsJson: text('inputs_json'),
  workflowJson: text('workflow_json'), // { type, webhook_id? }
  status: text('status').notNull().default('queued'), // 'queued' | 'running' | 'completed' | 'failed'
  resultJson: text('result_json'), // { run_report, assertions, evidence_pack }
  // v2.0: Trace storage fields
  traceSummaryJson: text('trace_summary_json'), // Lightweight stats (always stored)
  tracePolicy: text('trace_policy').default('on_failure'), // 'always' | 'on_failure' | 'on_violation'
  fullTraceJson: text('full_trace_json'), // Complete RunRecord (conditional)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('idx_runs_project').on(table.projectId),
  index('idx_runs_status').on(table.status),
]);

/**
 * Segment Embeddings - Pre-computed vectors for Ring 3 segments
 */
export const segmentEmbeddings = pgTable(
  'segment_embeddings',
  {
    segmentId: text('segment_id').primaryKey(), // "turn_hash:s-0", "turn_hash:s-1", etc.
    turnHash: text('turn_hash')
      .notNull()
      .references(() => turns.turnHash, { onDelete: 'cascade' }),
    segmentIndex: integer('segment_index').notNull(),
    segmentText: text('segment_text').notNull(),
    embeddingModel: text('embedding_model').notNull(),
    embeddingDim: integer('embedding_dim').notNull(),
    embedding: bytea('embedding').notNull(), // Float32Array as binary
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_segment_embeddings_turn').on(table.turnHash),
    index('idx_segment_embeddings_model').on(table.embeddingModel),
  ]
);

// ============================================================
// Type Exports (for use in application code)
// ============================================================

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type Turn = typeof turns.$inferSelect;
export type NewTurn = typeof turns.$inferInsert;

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;

export type Commit = typeof commits.$inferSelect;
export type NewCommit = typeof commits.$inferInsert;

export type Draft = typeof drafts.$inferSelect;
export type NewDraft = typeof drafts.$inferInsert;

export type MergeResult = typeof mergeResults.$inferSelect;
export type NewMergeResult = typeof mergeResults.$inferInsert;

export type SegmentEmbedding = typeof segmentEmbeddings.$inferSelect;
export type NewSegmentEmbedding = typeof segmentEmbeddings.$inferInsert;

export type DeployAgent = typeof deployAgents.$inferSelect;
export type NewDeployAgent = typeof deployAgents.$inferInsert;

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
