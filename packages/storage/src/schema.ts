/**
 * T3X Storage Schema (Drizzle ORM)
 *
 * PostgreSQL schema definition that works with:
 * - Embedded PostgreSQL (local development)
 * - PostgreSQL (Docker)
 * - Supabase (cloud)
 */

import type { ContentBlock } from '@t3x-dev/core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
export const projects = pgTable(
  'projects',
  {
    projectId: text('project_id').primaryKey(),
    name: text('name').notNull(),
    /** Owner user ID. null = public/legacy data (AUTH_DISABLED era) */
    ownerId: text('owner_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    metadataJson: text('metadata_json'),
    providerConfig: text('provider_config'), // JSON: project-level provider overrides
    defaultProvider: text('default_provider'), // "anthropic" | "openai" | "google"
    defaultModel: text('default_model'), // model ID from catalog
    autopilotConfig: jsonb('autopilot_config').$type<{
      enabled: boolean;
      min_nodes: number;
      auto_create_leaf: boolean;
      target_branch: string;
    }>(),
    businessRules: jsonb('business_rules')
      .$type<
        Array<{
          id: string;
          type: 'rule' | 'llm';
          rule?: string;
          prompt?: string;
          message?: string;
          severity: 'error' | 'warning';
        }>
      >()
      .default([]),
    extractionStyle: jsonb('extraction_style').$type<{
      granularity: 'concise' | 'balanced' | 'detailed';
      quote_length: 'minimal' | 'contextual';
      update_stance: 'conservative' | 'balanced' | 'aggressive';
      tier3: 'skip' | 'extract';
    }>(),
  },
  (table) => [index('idx_projects_owner').on(table.ownerId)]
);

/**
 * Global Settings - Key-value store for app-wide configuration
 * Used for provider registry config, feature flags, etc.
 */
export const globalSettings = pgTable('global_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON as text
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
    alias: text('alias'),
    parentCommitHash: text('parent_commit_hash'),
    committedAs: text('committed_as'),
    committedAt: timestamp('committed_at', { withTimezone: true }),
    positionX: real('position_x'),
    positionY: real('position_y'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    metadataJson: text('metadata_json'),
    provider: text('provider'), // override, null = inherit project default
    model: text('model'), // override, null = inherit project default
  },
  (table) => [
    index('idx_conversations_project').on(table.projectId),
    uniqueIndex('idx_conversations_project_alias')
      .on(table.projectId, table.alias)
      .where(sql`alias IS NOT NULL`),
    // Mirrors the production migration constraint declared in
    // adapters/postgres.ts (schema v38). Format: `^[a-z][a-z0-9_]{0,63}$`.
    // Keeping this in the Drizzle schema ensures all three places
    // (Drizzle, test SQL, production migration) agree on both shape AND name.
    check(
      'conversations_alias_format',
      sql`${table.alias} IS NULL OR ${table.alias} ~ '^[a-z][a-z0-9_]{0,63}$'`
    ),
  ]
);

/**
 * Turns - Individual conversation turns with hash chain
 */
export const turns = pgTable(
  'turns',
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
    contentBlocks: jsonb('content_blocks').$type<ContentBlock[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_turns_conversation').on(table.conversationId),
    index('idx_turns_project').on(table.projectId),
    index('idx_turns_parent').on(table.parentTurnHash),
  ]
);

/**
 * Source Text Revisions - Human edits to immutable turn source text
 *
 * Turns remain append-only. A source text revision records a user's
 * controlled edit over a turn and lets clients derive the effective source
 * text used for later incremental YOps generation.
 */
export const sourceTextRevisions = pgTable(
  'source_text_revisions',
  {
    revisionId: text('revision_id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.conversationId, { onDelete: 'cascade' }),
    turnHash: text('turn_hash')
      .notNull()
      .references(() => turns.turnHash, { onDelete: 'cascade' }),
    turnRole: text('turn_role').notNull(),
    action: text('action').notNull(),
    startChar: integer('start_char').notNull(),
    endChar: integer('end_char').notNull(),
    selectedText: text('selected_text').notNull(),
    replacementText: text('replacement_text').notNull(),
    baseContent: text('base_content').notNull(),
    content: text('content').notNull(),
    spans: jsonb('spans')
      .$type<
        Array<{
          id: string;
          action: 'add' | 'edit' | 'delete';
          start: number;
          end: number;
          text: string;
          originalText: string;
        }>
      >()
      .notNull()
      .default([]),
    baseContentHash: text('base_content_hash').notNull(),
    status: text('status').notNull().default('saved'),
    patchOps: jsonb('patch_ops').$type<unknown[]>(),
    patchError: text('patch_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_source_text_revisions_conversation').on(table.conversationId, table.updatedAt),
    index('idx_source_text_revisions_turn').on(table.turnHash, table.updatedAt),
    index('idx_source_text_revisions_project').on(table.projectId),
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
 * Drafts V2 - LLM-generated drafts pending adoption
 */
export const agentDrafts = pgTable(
  'agent_drafts',
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
    index('idx_agent_drafts_project').on(table.projectId),
    index('idx_agent_drafts_base_commit').on(table.baseCommitHash),
  ]
);

/**
 * Merge Drafts - Pending merge operations with user decisions
 *
 * Stores the intermediate state of a merge operation, allowing users to:
 * - Save and resume merge decisions
 * - Preview final merge result before committing
 * - Track merge history
 */
export const mergeDrafts = pgTable(
  'merge_drafts',
  {
    draftId: text('draft_id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    sourceHash: text('source_hash').notNull(),
    targetHash: text('target_hash').notNull(),
    sourceBranch: text('source_branch'),
    targetBranch: text('target_branch'),
    preparedJson: text('prepared_json').notNull(), // Merge2WayResult with user decisions
    status: text('status').notNull().default('pending'), // 'pending' | 'committed' | 'cancelled'
    message: text('message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_merge_drafts_project').on(table.projectId),
    index('idx_merge_drafts_status').on(table.status),
  ]
);

/**
 * Deploy Agents - Registered agents for deployment and evaluation
 * Note: This is different from the "agent" layer (LLM draft generation)
 */
export const deployAgents = pgTable(
  'deploy_agents',
  {
    deployAgentId: text('deploy_agent_id').primaryKey(),
    projectId: text('project_id').references(() => projects.projectId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    endpoint: text('endpoint').notNull(),
    type: text('type').notNull().default('http'), // 'http' | 'websocket' | 'grpc'
    authJson: text('auth_json'), // { type: 'bearer' | 'api_key', token, header? }
    status: text('status').notNull().default('idle'), // 'idle' | 'running' | 'error'
    lastRunId: text('last_run_id'),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('idx_deploy_agents_project').on(table.projectId)]
);

/**
 * Runs - Engine run records for tracking workflow executions
 *
 * v2.0: Added trace storage fields for agent evaluation
 */
export const runs = pgTable(
  'runs',
  {
    runId: text('run_id').primaryKey(),
    projectId: text('project_id').references(() => projects.projectId, { onDelete: 'cascade' }),
    runnerRunId: text('runner_run_id'),
    commitRef: text('commit_ref'),
    leafId: text('leaf_id'), // Reference to leaves.id (source prompt for this run)
    leafJson: text('leaf_json'), // { id, type, content? }
    inputsJson: text('inputs_json'),
    workflowJson: text('workflow_json'), // { type, webhook_id? }
    status: text('status').notNull().default('queued'), // 'queued' | 'running' | 'completed' | 'failed'
    resultJson: text('result_json'), // { run_report, assertions, evidence_pack }
    // v2.0: Trace storage fields
    traceSummaryJson: text('trace_summary_json'), // Lightweight stats (always stored)
    tracePolicy: text('trace_policy').default('on_failure'), // 'always' | 'on_failure' | 'on_violation'
    fullTraceJson: text('full_trace_json'), // Complete RunRecord (conditional)
    // v2.1: Metadata for A/B test filtering
    metadataJson: text('metadata_json'), // { model, prompt_version, workflow_id, test_case }
    // v2.3: Report asset fields
    title: text('title'),
    description: text('description'),
    tags: jsonb('tags').$type<string[]>().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_runs_project').on(table.projectId),
    index('idx_runs_status').on(table.status),
  ]
);

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

/**
 * Saved Comparisons - Persisted A/B comparison snapshots
 *
 * Stores a frozen copy of comparison results so users can revisit
 * historical A/B tests without recomputing.
 */
export const savedComparisons = pgTable(
  'saved_comparisons',
  {
    comparisonId: text('comparison_id').primaryKey(), // comp_xxxxxxxxxxxx
    projectId: text('project_id').references(() => projects.projectId, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull(),
    controlConfig: jsonb('control_config')
      .notNull()
      .$type<{ model: string; prompt_version: string }>(),
    treatmentConfig: jsonb('treatment_config')
      .notNull()
      .$type<{ model: string; prompt_version: string }>(),
    controlRunIds: jsonb('control_run_ids').notNull().$type<string[]>(),
    treatmentRunIds: jsonb('treatment_run_ids').notNull().$type<string[]>(),
    resultSnapshot: jsonb('result_snapshot').notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_saved_comparisons_project').on(table.projectId),
    index('idx_saved_comparisons_created_at').on(table.createdAt),
  ]
);

/**
 * Templates - Reusable prompt templates for leaf generation
 */
export const templates = pgTable(
  'templates',
  {
    templateId: text('template_id').primaryKey(), // tmpl_xxxxxxxxxxxx
    title: text('title').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(), // social|business|technical|creative
    leafType: text('leaf_type').notNull(), // tweet|linkedin|reddit|threads|article|email|slack
    systemPrompt: text('system_prompt').notNull(),
    userPrompt: text('user_prompt').notNull(),
    variables: jsonb('variables').notNull().$type<
      Array<{
        name: string;
        description: string;
        required: boolean;
        defaultValue?: string;
      }>
    >(),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    isBuiltin: boolean('is_builtin').notNull().default(false),
    /** Default constraints applied when using this template */
    defaultConstraints: jsonb('default_constraints')
      .$type<
        Array<{ type: 'require' | 'exclude'; match_mode: 'exact' | 'semantic'; value: string }>
      >()
      .default([]),
    /** Default semantic thresholds for validation */
    semanticThreshold: jsonb('semantic_threshold').$type<{
      require: number;
      exclude: number;
    } | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_templates_category').on(table.category),
    index('idx_templates_leaf_type').on(table.leafType),
  ]
);

/**
 * YSchema Validation Runs - Internal deterministic validation records
 *
 * Binds a validation result to a T3X commit, schema identity, and validator
 * version. External CI integrations should mirror this table later instead
 * of becoming the source of truth.
 */
export const yschemaValidationRuns = pgTable(
  'yschema_validation_runs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    commitHash: text('commit_hash').notNull(),
    schemaName: text('schema_name').notNull(),
    schemaVersion: text('schema_version').notNull(),
    schemaHash: text('schema_hash').notNull(),
    validatorVersion: text('validator_version').notNull(),
    status: text('status').notNull(),
    valid: boolean('valid').notNull(),
    ready: boolean('ready').notNull(),
    errorCount: integer('error_count').notNull(),
    gapCount: integer('gap_count').notNull(),
    fixCount: integer('fix_count').notNull(),
    resultJson: jsonb('result_json').notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_yschema_validation_runs_project').on(table.projectId, table.createdAt),
    index('idx_yschema_validation_runs_commit').on(table.projectId, table.commitHash),
    index('idx_yschema_validation_runs_schema').on(table.schemaName, table.schemaHash),
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

export type SourceTextRevision = typeof sourceTextRevisions.$inferSelect;
export type NewSourceTextRevision = typeof sourceTextRevisions.$inferInsert;

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;

export type AgentDraft = typeof agentDrafts.$inferSelect;
export type NewAgentDraft = typeof agentDrafts.$inferInsert;

export type SegmentEmbedding = typeof segmentEmbeddings.$inferSelect;
export type NewSegmentEmbedding = typeof segmentEmbeddings.$inferInsert;

export type DeployAgent = typeof deployAgents.$inferSelect;
export type NewDeployAgent = typeof deployAgents.$inferInsert;

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;

export type MergeDraft = typeof mergeDrafts.$inferSelect;
export type NewMergeDraft = typeof mergeDrafts.$inferInsert;

export type SavedComparison = typeof savedComparisons.$inferSelect;
export type NewSavedComparison = typeof savedComparisons.$inferInsert;

export type YSchemaValidationRunRecord = typeof yschemaValidationRuns.$inferSelect;
export type NewYSchemaValidationRunRecord = typeof yschemaValidationRuns.$inferInsert;

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;

export type GlobalSetting = typeof globalSettings.$inferSelect;
export type NewGlobalSetting = typeof globalSettings.$inferInsert;

// Events outbox for realtime sync (see schema-events.ts)
export { type EventRow, events, type NewEventRow } from './schema-events';
