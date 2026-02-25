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
-- Projects
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  metadata_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- Drafts (drafts_v2)
CREATE TABLE IF NOT EXISTS drafts_v2 (
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
  merge_summary JSONB,
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
CREATE INDEX IF NOT EXISTS idx_drafts_v2_project ON drafts_v2(project_id);
CREATE INDEX IF NOT EXISTS idx_drafts_v2_base_commit ON drafts_v2(base_commit_hash);
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
  created_by TEXT
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
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
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
  // Create in-memory PGLite
  const client = new PGlite();

  // Create Drizzle instance
  const db = drizzle(client, { schema }) as unknown as AnyDB;

  // Create tables
  await client.exec(CREATE_TABLES_SQL);

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
