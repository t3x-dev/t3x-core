/**
 * Test Setup
 *
 * Provides isolated PGLite database for each test file.
 * Each test file gets a fresh in-memory database.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { AnyDB } from '../adapters';
import * as schema from '../schema';

/**
 * SQL to create all tables (matching schema.ts)
 * Exported for reuse in other packages (e.g., t3x-webui tests)
 */
export const CREATE_TABLES_SQL = `
-- Users (OAuth authentication)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_unique ON users(provider, provider_id);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT,
  metadata_json TEXT,
  provider_config TEXT,
  autopilot_config JSONB,
  business_rules JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  title TEXT,
  parent_commit_hash TEXT,
  position_x REAL,
  position_y REAL,
  metadata_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Turns (turns_v2)
CREATE TABLE IF NOT EXISTS turns_v2 (
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

-- Commits (commits_v2)
CREATE TABLE IF NOT EXISTS commits_v2 (
  commit_hash TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  branch TEXT NOT NULL,
  message TEXT,
  parents_json TEXT NOT NULL,
  turn_window_json TEXT NOT NULL,
  facet_snapshot_json TEXT NOT NULL,
  pipeline_config_json TEXT,
  draft_id TEXT,
  draft_text_hash TEXT,
  signature_json TEXT,
  source_excerpt_json TEXT,
  must_have_json TEXT,
  mustnt_have_json TEXT,
  position_x REAL,
  position_y REAL,
  source_refs_json TEXT,
  anchors_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  turn_hash TEXT NOT NULL REFERENCES turns_v2(turn_hash) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,
  segment_text TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dim INTEGER NOT NULL,
  embedding BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Commits V3
CREATE TABLE IF NOT EXISTS commits_v3 (
  -- First class (in hash)
  hash TEXT PRIMARY KEY,
  schema TEXT NOT NULL DEFAULT 'commit/v3',
  parents TEXT[] NOT NULL DEFAULT '{}',
  author JSONB NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL,
  content JSONB NOT NULL,

  -- Second class (not in hash)
  project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  message TEXT,
  branch TEXT,
  position_x REAL,
  position_y REAL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Commits V4 (pure knowledge - no constraints)
CREATE TABLE IF NOT EXISTS commits_v4 (
  -- First class (in hash)
  hash TEXT PRIMARY KEY,
  schema TEXT NOT NULL DEFAULT 't3x/commit/v4',
  parents JSONB NOT NULL DEFAULT '[]',
  author JSONB NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL,
  content JSONB NOT NULL,

  -- Second class (not in hash)
  project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  message TEXT,
  branch TEXT,
  source_refs JSONB,
  merkle_root TEXT,
  merge_summary JSONB,
  semantic JSONB,
  position_x REAL,
  position_y REAL,

  -- Timestamps
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
CREATE INDEX IF NOT EXISTS idx_turns_v2_conversation ON turns_v2(conversation_id);
CREATE INDEX IF NOT EXISTS idx_turns_v2_project ON turns_v2(project_id);
CREATE INDEX IF NOT EXISTS idx_turns_v2_parent ON turns_v2(parent_turn_hash);
CREATE INDEX IF NOT EXISTS idx_commits_v2_project ON commits_v2(project_id);
CREATE INDEX IF NOT EXISTS idx_commits_v2_branch ON commits_v2(branch);
CREATE INDEX IF NOT EXISTS idx_commits_v2_draft ON commits_v2(draft_id);
CREATE INDEX IF NOT EXISTS idx_branches_project ON branches(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_drafts_project ON agent_drafts(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_drafts_base_commit ON agent_drafts(base_commit_hash);
CREATE INDEX IF NOT EXISTS idx_segment_embeddings_turn ON segment_embeddings(turn_hash);
CREATE INDEX IF NOT EXISTS idx_segment_embeddings_model ON segment_embeddings(embedding_model);
CREATE INDEX IF NOT EXISTS idx_commits_v3_project ON commits_v3(project_id);
CREATE INDEX IF NOT EXISTS idx_commits_v3_branch ON commits_v3(branch);
CREATE INDEX IF NOT EXISTS idx_commits_v3_committed_at ON commits_v3(committed_at);
CREATE INDEX IF NOT EXISTS idx_commits_v4_project ON commits_v4(project_id);
CREATE INDEX IF NOT EXISTS idx_commits_v4_branch ON commits_v4(branch);
CREATE INDEX IF NOT EXISTS idx_commits_v4_created_at ON commits_v4(created_at);
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
  corrective_feedback TEXT,
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

-- Drafts V3 (Workbench / pre-commit working area)
CREATE TABLE IF NOT EXISTS drafts_v3 (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  goal TEXT,
  parent_commit_hash TEXT,
  forked_from TEXT,
  sentences_json JSONB NOT NULL DEFAULT '[]',
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
CREATE INDEX IF NOT EXISTS idx_drafts_v3_project ON drafts_v3(project_id);
CREATE INDEX IF NOT EXISTS idx_drafts_v3_status ON drafts_v3(status);

-- Extraction Feedback (Anchoring L4)
CREATE TABLE IF NOT EXISTS extraction_feedback (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  draft_id TEXT NOT NULL,
  sp_id TEXT NOT NULL,
  action TEXT NOT NULL,
  original_text TEXT,
  inference_type TEXT,
  confidence REAL,
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
  new_sentence_id TEXT NOT NULL,
  new_commit_hash TEXT NOT NULL,
  existing_sentence_id TEXT NOT NULL,
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

-- Sentence Modifications (audit trail)
CREATE TABLE IF NOT EXISTS sentence_modifications (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  sp_id TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_text TEXT,
  new_text TEXT,
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_smod_draft ON sentence_modifications(draft_id);
CREATE INDEX IF NOT EXISTS idx_smod_sp ON sentence_modifications(sp_id);

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

-- Delta Log (Phase 2 — semantic delta tracking)
CREATE TABLE IF NOT EXISTS delta_log (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  turn_hash TEXT,
  delta JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_delta_log_conv ON delta_log(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_delta_log_project ON delta_log(project_id);

-- Sentence Relations (Ring 4 — Inter-sentence relationships)
CREATE TABLE IF NOT EXISTS sentence_relations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  commit_hash TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,
  confidence REAL NOT NULL,
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sr_commit ON sentence_relations (commit_hash);
CREATE INDEX IF NOT EXISTS idx_sr_project ON sentence_relations (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sr_pair ON sentence_relations(commit_hash, source_id, target_id, type);

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
  sentence_id TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  PRIMARY KEY (node_id, sentence_id)
);
CREATE INDEX IF NOT EXISTS idx_knm_sentence ON knowledge_node_members (sentence_id);

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

`;

/** SQL for pgvector sentence_vectors table (created separately, may fail if vector unavailable) */
export const CREATE_VECTOR_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS sentence_vectors (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  text TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  model_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tsv tsvector
);
CREATE INDEX IF NOT EXISTS idx_sv_project ON sentence_vectors(project_id);
CREATE INDEX IF NOT EXISTS idx_sv_commit ON sentence_vectors(commit_hash);
CREATE INDEX IF NOT EXISTS idx_sv_tsv ON sentence_vectors USING GIN (tsv);
UPDATE sentence_vectors SET tsv = to_tsvector('simple', text) WHERE tsv IS NULL;
`;

/**
 * Create a fresh test database
 * Each call creates a new in-memory PGLite instance
 */
export async function createTestDB(): Promise<{
  db: AnyDB;
  client: PGlite;
  cleanup: () => Promise<void>;
}> {
  // Try to load pgvector extension (optional)
  // biome-ignore lint/suspicious/noExplicitAny: PGLite extension types are dynamic
  let extensions: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { vector } = require('@electric-sql/pglite/vector');
    extensions = { vector };
  } catch {
    // pgvector not available
  }

  // Create in-memory PGLite (with pgvector if available)
  const client = new PGlite({
    ...(extensions ? { extensions } : {}),
  });

  // Create Drizzle instance
  const db = drizzle(client, { schema }) as unknown as AnyDB;

  // Create core tables
  await client.exec(CREATE_TABLES_SQL);

  // Try to create vector tables (graceful — skipped if vector unavailable)
  try {
    await client.exec('CREATE EXTENSION IF NOT EXISTS vector;');
    await client.exec(CREATE_VECTOR_TABLES_SQL);
  } catch {
    // pgvector not available — sentence vector tests will be skipped
  }

  // Cleanup function
  const cleanup = async () => {
    await client.close();
  };

  return { db, client, cleanup };
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
