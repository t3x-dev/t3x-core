/**
 * Test Setup
 *
 * Provides isolated PostgreSQL database for each test file.
 * Each test file gets a fresh database dropped after the test.
 *
 * Requires the embedded-postgres globalSetup to be running (see globalSetup.ts).
 * If DATABASE_URL is set, connects to that instead (CI with Docker PG).
 */

import postgres from 'postgres';
import type { AnyDB } from '../adapters';
import { closePostgresStorage, createPostgresStorage } from '../adapters/postgres';
import { getTestPostgresPort } from './pgTestConfig';

/**
 * SQL to create all tables (matching schema.ts)
 * Exported for reuse in other packages (e.g., t3x-webui tests)
 */
export const CREATE_TABLES_SQL = `
-- Users (Multi-provider authentication)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  name TEXT,
  avatar_url TEXT,
  username TEXT UNIQUE,
  password_hash TEXT,
  default_extraction_style JSONB,
  default_provider TEXT,
  default_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT,
  metadata_json TEXT,
  provider_config TEXT,
  default_provider TEXT,
  default_model TEXT,
  autopilot_config JSONB,
  business_rules JSONB DEFAULT '[]',
  extraction_style JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  title TEXT,
  alias TEXT CONSTRAINT conversations_alias_format CHECK (alias IS NULL OR alias ~ '^[a-z][a-z0-9_]{0,63}$'),
  parent_commit_hash TEXT,
  committed_as TEXT,
  committed_at TIMESTAMPTZ,
  position_x REAL,
  position_y REAL,
  metadata_json TEXT,
  provider TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Turns
CREATE TABLE IF NOT EXISTS turns (
  turn_hash TEXT PRIMARY KEY,
  parent_turn_hash TEXT,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT,
  rings_json TEXT,
  content_blocks JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Branches
CREATE TABLE IF NOT EXISTS branches (
  branch_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_branch TEXT,
  head_commit_hash TEXT,
  description TEXT,
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, name)
);

-- Agent Drafts (formerly drafts_v2)
CREATE TABLE IF NOT EXISTS agent_drafts (
  draft_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  base_commit_hash TEXT,
  turn_anchor_hash TEXT,
  bridge_id TEXT NOT NULL,
  bridge_payload_json TEXT NOT NULL,
  must_have_json TEXT,
  mustnt_have_json TEXT,
  llm_config_json TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ephemeral',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Segment Embeddings
CREATE TABLE IF NOT EXISTS segment_embeddings (
  segment_id TEXT PRIMARY KEY,
  turn_hash TEXT NOT NULL REFERENCES turns(turn_hash) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,
  segment_text TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dim INTEGER NOT NULL,
  embedding BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leaves (application layer - owns constraints, output, validation)
CREATE TABLE IF NOT EXISTS leaves (
  id TEXT PRIMARY KEY,
  commit_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  constraints JSONB NOT NULL DEFAULT '[]',
  config JSONB NOT NULL DEFAULT '{}',
  output TEXT,
  generated_at TIMESTAMPTZ,
  assertions JSONB,
  runner_assertions JSONB,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

-- Pins (source selection for commit sources + conversation context)
CREATE TABLE IF NOT EXISTS pins (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  selected_assertion_ids JSONB,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pinned_by TEXT
);

-- Conversation Contexts (per-conversation context customization)
CREATE TABLE IF NOT EXISTS conversation_contexts (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  selected_pin_ids JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_project_alias
  ON conversations (project_id, alias) WHERE alias IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_turns_conversation ON turns(conversation_id);
CREATE INDEX IF NOT EXISTS idx_turns_project ON turns(project_id);
CREATE INDEX IF NOT EXISTS idx_turns_parent ON turns(parent_turn_hash);

-- Source Text Revisions
CREATE TABLE IF NOT EXISTS source_text_revisions (
  revision_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  turn_hash TEXT NOT NULL REFERENCES turns(turn_hash) ON DELETE CASCADE,
  turn_role TEXT NOT NULL,
  action TEXT NOT NULL,
  start_char INTEGER NOT NULL,
  end_char INTEGER NOT NULL,
  selected_text TEXT NOT NULL,
  replacement_text TEXT NOT NULL,
  base_content TEXT NOT NULL,
  content TEXT NOT NULL,
  spans JSONB NOT NULL DEFAULT '[]'::jsonb,
  base_content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'saved',
  patch_ops JSONB,
  patch_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_source_text_revisions_conversation
  ON source_text_revisions(conversation_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_source_text_revisions_turn
  ON source_text_revisions(turn_hash, updated_at);
CREATE INDEX IF NOT EXISTS idx_source_text_revisions_project ON source_text_revisions(project_id);
CREATE INDEX IF NOT EXISTS idx_branches_project ON branches(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_drafts_project ON agent_drafts(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_drafts_base_commit ON agent_drafts(base_commit_hash);
CREATE INDEX IF NOT EXISTS idx_segment_embeddings_turn ON segment_embeddings(turn_hash);
CREATE INDEX IF NOT EXISTS idx_segment_embeddings_model ON segment_embeddings(embedding_model);
CREATE INDEX IF NOT EXISTS idx_leaves_commit ON leaves(commit_hash);
CREATE INDEX IF NOT EXISTS idx_leaves_project ON leaves(project_id);
CREATE INDEX IF NOT EXISTS idx_leaves_type ON leaves(type);
CREATE INDEX IF NOT EXISTS idx_pins_project ON pins(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pins_unique ON pins(project_id, type, ref_id);

-- Leaf History
CREATE TABLE IF NOT EXISTS leaf_history (
  id TEXT PRIMARY KEY,
  leaf_id TEXT NOT NULL REFERENCES leaves(id) ON DELETE CASCADE,
  output TEXT NOT NULL,
  config JSONB NOT NULL,
  model TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  prompt_used TEXT
);
CREATE INDEX IF NOT EXISTS idx_leaf_history_leaf ON leaf_history(leaf_id);
CREATE INDEX IF NOT EXISTS idx_leaf_history_generated_at ON leaf_history(generated_at);

-- Merge Drafts
CREATE TABLE IF NOT EXISTS merge_drafts (
  draft_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  source_hash TEXT NOT NULL,
  target_hash TEXT NOT NULL,
  source_branch TEXT,
  target_branch TEXT,
  prepared_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_merge_drafts_project ON merge_drafts(project_id);
CREATE INDEX IF NOT EXISTS idx_merge_drafts_status ON merge_drafts(status);

-- Deploy Agents
CREATE TABLE IF NOT EXISTS deploy_agents (
  deploy_agent_id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'http',
  auth_json TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  last_run_id TEXT,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deploy_agents_project ON deploy_agents(project_id);

-- Runs
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  runner_run_id TEXT,
  commit_ref TEXT,
  leaf_id TEXT,
  leaf_json TEXT,
  inputs_json TEXT,
  workflow_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  result_json TEXT,
  trace_summary_json TEXT,
  trace_policy TEXT DEFAULT 'on_failure',
  full_trace_json TEXT,
  metadata_json TEXT,
  title TEXT,
  description TEXT,
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);

-- Share Tokens
CREATE TABLE IF NOT EXISTS share_tokens (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_share_tokens_entity ON share_tokens(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_share_tokens_project ON share_tokens(project_id);

CREATE TABLE IF NOT EXISTS saved_comparisons (
  comparison_id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  control_config JSONB NOT NULL,
  treatment_config JSONB NOT NULL,
  control_run_ids JSONB NOT NULL DEFAULT '[]',
  treatment_run_ids JSONB NOT NULL DEFAULT '[]',
  result_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_comparisons_project ON saved_comparisons(project_id);
CREATE INDEX IF NOT EXISTS idx_saved_comparisons_created_at ON saved_comparisons(created_at);

-- Templates
CREATE TABLE IF NOT EXISTS templates (
  template_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  leaf_type TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  user_prompt TEXT NOT NULL,
  variables JSONB NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]',
  is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
  default_constraints JSONB DEFAULT '[]'::jsonb,
  semantic_threshold JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_leaf_type ON templates(leaf_type);

-- Drafts (Workbench / pre-commit working area)
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  goal TEXT,
  parent_commit_hash TEXT,
  forked_from TEXT,
  nodes_json JSONB NOT NULL DEFAULT '[]',
  constraints_json JSONB NOT NULL DEFAULT '[]',
  instructions TEXT,
  preview_type TEXT,
  preview_output TEXT,
  preview_generated_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'editing',
  committed_as TEXT,
  committed_leaf_id TEXT,
  target_branch TEXT DEFAULT 'main',
  revision INTEGER NOT NULL DEFAULT 1,
  extraction_mode TEXT,
  semantic_points_json JSONB,
  extraction_cursor_json JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drafts_project ON drafts(project_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);

-- Extraction Feedback (Anchoring L4)
CREATE TABLE IF NOT EXISTS extraction_feedback (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  draft_id TEXT NOT NULL,
  sp_id TEXT NOT NULL,
  action TEXT NOT NULL,
  original_text TEXT,
  inference_type TEXT,
  zone TEXT,
  low_coverage BOOLEAN DEFAULT FALSE,
  edited_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_extraction_feedback_project ON extraction_feedback(project_id);
CREATE INDEX IF NOT EXISTS idx_extraction_feedback_draft ON extraction_feedback(draft_id);

-- Knowledge Conflicts (S15 conflict detection persistence)
CREATE TABLE IF NOT EXISTS knowledge_conflicts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  new_node_id TEXT NOT NULL,
  new_commit_hash TEXT NOT NULL,
  existing_node_id TEXT NOT NULL,
  existing_commit_hash TEXT NOT NULL,
  cosine REAL NOT NULL,
  jaccard REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_conflicts_project ON knowledge_conflicts(project_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_conflicts_status ON knowledge_conflicts(status);

-- Metrics Events (S17 Observable Metrics)
CREATE TABLE IF NOT EXISTS metrics_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  value REAL NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_metrics_events_project ON metrics_events(project_id);
CREATE INDEX IF NOT EXISTS idx_metrics_events_type ON metrics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_metrics_events_created_at ON metrics_events(created_at);

-- Node Modifications (audit trail)
CREATE TABLE IF NOT EXISTS node_modifications (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  sp_id TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_text TEXT,
  new_text TEXT,
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nmod_draft ON node_modifications(draft_id);
CREATE INDEX IF NOT EXISTS idx_nmod_sp ON node_modifications(sp_id);

-- Leaf Output Edits (Item 17 — Constraint Reverse Learning)
CREATE TABLE IF NOT EXISTS leaf_output_edits (
  id TEXT PRIMARY KEY,
  leaf_id TEXT NOT NULL REFERENCES leaves(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  original_output TEXT NOT NULL,
  modified_output TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leaf_output_edits_leaf ON leaf_output_edits(leaf_id);
CREATE INDEX IF NOT EXISTS idx_leaf_output_edits_project ON leaf_output_edits(project_id);

-- Notifications (Item 16 — persistent alerts)
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  project_id TEXT,
  ref_id TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_project ON notifications(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- YOps Log (Phase 2 — semantic yops tracking)
CREATE TABLE IF NOT EXISTS yops_log (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  turn_hash TEXT,
  yops JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_yops_log_conv ON yops_log(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_yops_log_project ON yops_log(project_id);

-- Node Relations (Ring 4 — Inter-node relationships)
CREATE TABLE IF NOT EXISTS node_relations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  commit_hash TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nr_commit ON node_relations (commit_hash);
CREATE INDEX IF NOT EXISTS idx_nr_project ON node_relations (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nr_pair ON node_relations(commit_hash, source_id, target_id, type);

-- Knowledge Graph (cross-conversation entity/topic graph)
CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'topic',
  summary TEXT,
  member_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kn_project ON knowledge_nodes (project_id);

CREATE TABLE IF NOT EXISTS knowledge_node_members (
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  content_node_id TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  PRIMARY KEY (node_id, content_node_id)
);
CREATE INDEX IF NOT EXISTS idx_knm_content_node ON knowledge_node_members (content_node_id);

CREATE TABLE IF NOT EXISTS knowledge_edges (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_node_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0,
  evidence JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ke_project ON knowledge_edges (project_id);
CREATE INDEX IF NOT EXISTS idx_ke_source ON knowledge_edges (source_node_id);
CREATE INDEX IF NOT EXISTS idx_ke_target ON knowledge_edges (target_node_id);

-- Trees (source-of-truth for current tree state)
CREATE TABLE IF NOT EXISTS trees (
  conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  tree_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  topic_id TEXT,
  type TEXT NOT NULL,
  slots JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL,
  slot_sources JSONB,
  manual_edited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, tree_id)
);
CREATE INDEX IF NOT EXISTS idx_trees_project ON trees(project_id);
CREATE INDEX IF NOT EXISTS idx_trees_type ON trees(type);
CREATE INDEX IF NOT EXISTS idx_trees_conv_topic ON trees(conversation_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_trees_manual ON trees(conversation_id, manual_edited) WHERE manual_edited = TRUE;

-- Tree Relations (source-of-truth for current relations)
CREATE TABLE IF NOT EXISTS tree_relations (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  topic_id TEXT,
  from_tree_id TEXT NOT NULL,
  to_tree_id TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trel_conversation ON tree_relations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_trel_topic ON tree_relations(conversation_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_trel_from ON tree_relations(from_tree_id);
CREATE INDEX IF NOT EXISTS idx_trel_to ON tree_relations(to_tree_id);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);

-- Device Codes (OAuth Device Flow - RFC 8628)
CREATE TABLE IF NOT EXISTS device_codes (
  id TEXT PRIMARY KEY,
  device_code TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  user_id TEXT,
  api_key_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

-- Token Usage (LLM token metering)
CREATE TABLE IF NOT EXISTS token_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_cost NUMERIC(10,6) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_token_usage_user_created ON token_usage(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_project_created ON token_usage(project_id, created_at);

-- Accounts (OAuth Provider Records)
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider, provider_account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

-- Topics (Multi-topic Conversations)
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_topics_conversation ON topics(conversation_id);
CREATE INDEX IF NOT EXISTS idx_topics_project ON topics(project_id);

-- Events outbox (v39) — cross-process realtime sync
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  project_id TEXT NOT NULL,
  conversation_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS events_project_id_idx ON events (project_id, id);
CREATE INDEX IF NOT EXISTS events_conversation_id_idx ON events (conversation_id, id)
  WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_created_at_idx ON events (created_at);

`;

/** SQL for pgvector tables (created separately, may fail if vector unavailable) */
export const CREATE_VECTOR_TABLES_SQL = '';

const TEST_PORT = getTestPostgresPort();
const TEST_HOST = 'localhost';
const TEST_USER = 'postgres';
const TEST_PASSWORD = 'password';

function getAdminUrl(): string {
  if (process.env.DATABASE_URL) {
    // CI: connect to the admin database from DATABASE_URL but switch to postgres db
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = '/postgres';
    return url.toString();
  }
  return `postgresql://${TEST_USER}:${TEST_PASSWORD}@${TEST_HOST}:${TEST_PORT}/postgres`;
}

function getDbUrl(dbName: string): string {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${dbName}`;
    return url.toString();
  }
  return `postgresql://${TEST_USER}:${TEST_PASSWORD}@${TEST_HOST}:${TEST_PORT}/${dbName}`;
}

function ignoreNotice(_notice: postgres.Notice): void {}

/**
 * Create a fresh isolated test database.
 * Each call creates a new PostgreSQL database, runs schema setup, and returns
 * a Drizzle instance. The cleanup function drops the database on teardown.
 *
 * `sql` is a raw postgres.js Sql instance for direct SQL execution in tests
 * that need to bypass the ORM (e.g., to backdate timestamps).
 */
export async function createTestDB(): Promise<{
  db: AnyDB;
  /** Raw postgres.js Sql for direct SQL execution in tests */
  sql: postgres.Sql;
  cleanup: () => Promise<void>;
}> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const dbName = `test_${suffix}`;
  const connectionString = getDbUrl(dbName);

  // Create the database via admin connection
  const adminSql = postgres(getAdminUrl(), { max: 1, onnotice: ignoreNotice });
  await adminSql.unsafe(`CREATE DATABASE "${dbName}"`);
  await adminSql.end();

  // Let the real adapter own schema bootstrap so tests exercise production init once.
  const db = await createPostgresStorage({
    connectionString,
    onnotice: ignoreNotice,
  });

  // Keep a raw sql connection for tests that need direct SQL access
  const rawSql = postgres(connectionString, { max: 5, onnotice: ignoreNotice });

  if (CREATE_VECTOR_TABLES_SQL.trim()) {
    const [{ available = false } = {}] = await rawSql.unsafe<{ available: boolean }[]>(
      "SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') AS available"
    );

    if (available) {
      await rawSql.unsafe('CREATE EXTENSION IF NOT EXISTS vector;');
      await rawSql.unsafe(CREATE_VECTOR_TABLES_SQL);
    }
  }

  // Cleanup: close connection and drop the database
  const cleanup = async () => {
    await closePostgresStorage();
    await rawSql.end();

    const dropSql = postgres(getAdminUrl(), { max: 1, onnotice: ignoreNotice });
    try {
      // Terminate any remaining connections to the test database
      await dropSql.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`
      );
      await dropSql.unsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
    } finally {
      await dropSql.end();
    }
  };

  return { db, sql: rawSql, cleanup };
}

/**
 * Sleep helper for tests that need unique timestamps
 * (ensures turns inserted in sequence have different createdAt values)
 */
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Test data factories
 */
export const testData = {
  project: (overrides: Partial<{ name: string; description: string }> = {}) => ({
    name: overrides.name ?? 'Test Project',
    description: overrides.description ?? 'A test project',
  }),

  conversation: (projectId: string, overrides: Partial<{ title: string }> = {}) => ({
    projectId,
    title: overrides.title ?? 'Test Conversation',
  }),

  turn: (
    projectId: string,
    conversationId: string,
    overrides: Partial<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string }> = {}
  ) => ({
    projectId,
    conversationId,
    role: overrides.role ?? 'user',
    content: overrides.content ?? 'Hello, this is a test message.',
  }),
};
