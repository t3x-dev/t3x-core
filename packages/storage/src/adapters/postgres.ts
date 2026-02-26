/**
 * PostgreSQL Adapter
 *
 * Standard PostgreSQL connection for Docker/production deployments.
 * Uses postgres.js for best performance.
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema';
import { seedBuiltinTemplates } from '../seed/templates';

export type PostgresDB = PostgresJsDatabase<typeof schema>;

export interface PostgresConfig {
  /** Connection string (e.g., 'postgresql://user:pass@localhost:5432/t3x') */
  connectionString: string;
  /** Maximum connections in pool */
  maxConnections?: number;
}

let client: postgres.Sql | null = null;
let db: PostgresDB | null = null;

/**
 * Create PostgreSQL storage for Docker/production
 */
export async function createPostgresStorage(config: PostgresConfig): Promise<PostgresDB> {
  // Create postgres.js client
  client = postgres(config.connectionString, {
    max: config.maxConnections || 10,
  });

  // Create Drizzle instance
  db = drizzle(client, { schema });

  // Initialize schema (create tables if not exist)
  await initializeSchema(client);

  // Seed builtin templates
  await seedBuiltinTemplates(db as unknown as import('../adapters').AnyDB);

  return db;
}

/**
 * Get the current database instance
 */
export function getPostgresDB(): PostgresDB {
  if (!db) {
    throw new Error('PostgreSQL database not initialized. Call createPostgresStorage() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export async function closePostgresStorage(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
    db = null;
  }
}

/**
 * Initialize database schema
 */
async function initializeSchema(sql: postgres.Sql): Promise<void> {
  // Create tables if they don't exist
  await sql.unsafe(`
    -- Projects table
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      metadata_json TEXT
    );

    -- Conversations table
    CREATE TABLE IF NOT EXISTS conversations (
      conversation_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      title TEXT,
      parent_commit_hash TEXT,
      position_x REAL,
      position_y REAL,
      created_at TIMESTAMPTZ NOT NULL,
      metadata_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);

    -- Turns V2 table
    CREATE TABLE IF NOT EXISTS turns_v2 (
      turn_hash TEXT PRIMARY KEY,
      parent_turn_hash TEXT,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      language TEXT,
      rings_json TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_turns_v2_conversation ON turns_v2(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_turns_v2_project ON turns_v2(project_id);
    CREATE INDEX IF NOT EXISTS idx_turns_v2_parent ON turns_v2(parent_turn_hash);

    -- Branches table
    CREATE TABLE IF NOT EXISTS branches (
      branch_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      parent_branch TEXT,
      head_commit_hash TEXT,
      description TEXT,
      is_current INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      UNIQUE(project_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_branches_project ON branches(project_id);

    -- Commits V2 table
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
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_commits_v2_project ON commits_v2(project_id);
    CREATE INDEX IF NOT EXISTS idx_commits_v2_branch ON commits_v2(branch);
    CREATE INDEX IF NOT EXISTS idx_commits_v2_draft ON commits_v2(draft_id);

    -- Migration: Add anchors_json column to existing commits_v2 tables (v1.1)
    -- Note: ADD COLUMN IF NOT EXISTS is idempotent in PostgreSQL 9.6+
    ALTER TABLE commits_v2 ADD COLUMN IF NOT EXISTS anchors_json TEXT;

    -- Migration: rename drafts_v2 → agent_drafts for existing databases
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'drafts_v2' AND schemaname = 'public') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'agent_drafts' AND schemaname = 'public') THEN
          ALTER TABLE drafts_v2 RENAME TO agent_drafts;
        ELSE
          DROP TABLE drafts_v2;
        END IF;
      END IF;
    END $$;

    -- Agent Drafts table (formerly drafts_v2)
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
      created_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_agent_drafts_project ON agent_drafts(project_id);
    CREATE INDEX IF NOT EXISTS idx_agent_drafts_base_commit ON agent_drafts(base_commit_hash);

    -- Segment Embeddings table
    CREATE TABLE IF NOT EXISTS segment_embeddings (
      segment_id TEXT PRIMARY KEY,
      turn_hash TEXT NOT NULL REFERENCES turns_v2(turn_hash) ON DELETE CASCADE,
      segment_index INTEGER NOT NULL,
      segment_text TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      embedding_dim INTEGER NOT NULL,
      embedding BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_segment_embeddings_turn ON segment_embeddings(turn_hash);
    CREATE INDEX IF NOT EXISTS idx_segment_embeddings_model ON segment_embeddings(embedding_model);

    -- Deploy Agents table (for Runner/n8n integration)
    -- NOTE: Foreign key on project_id is only applied to new databases.
    -- For existing databases, the API layer validates project_id existence.
    -- project_id is nullable by design (agents can be global/unattached to projects).
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

    -- Runs table (Engine → Runner → n8n flow)
    -- NOTE: Foreign key on project_id is only applied to new databases.
    -- For existing databases, the API layer validates project_id existence.
    -- project_id is nullable by design (runs can be standalone/unattached to projects).
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
      -- v2.0: Trace storage fields
      trace_summary_json TEXT,
      trace_policy TEXT DEFAULT 'on_failure',
      full_trace_json TEXT,
      -- v2.1: Metadata for A/B test filtering
      metadata_json TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);

    -- Migration: Add leaf_id column to existing runs tables (v2.2)
    ALTER TABLE runs ADD COLUMN IF NOT EXISTS leaf_id TEXT;

    -- Migration: Add report asset fields to existing runs tables (v2.3)
    ALTER TABLE runs ADD COLUMN IF NOT EXISTS title TEXT;
    ALTER TABLE runs ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE runs ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';

    -- Commits V3 table (sentence-based semantic snapshots)
    -- NOTE: project_id is nullable by design (commits can be standalone/unattached).
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
    CREATE INDEX IF NOT EXISTS idx_commits_v3_project ON commits_v3(project_id);
    CREATE INDEX IF NOT EXISTS idx_commits_v3_branch ON commits_v3(branch);
    CREATE INDEX IF NOT EXISTS idx_commits_v3_committed_at ON commits_v3(committed_at);
    CREATE INDEX IF NOT EXISTS idx_commits_v3_sentences ON commits_v3 USING GIN ((content->'sentences'));
    CREATE INDEX IF NOT EXISTS idx_commits_v3_constraints ON commits_v3 USING GIN ((content->'constraints'));

    -- Merge Drafts table (for merge workspace PENDING state)
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

    -- ═══════════════════════════════════════════════════════════════════════════
    -- V4 Architecture Tables
    -- ═══════════════════════════════════════════════════════════════════════════

    -- Commits V4 table (pure knowledge - sentences only, NO constraints)
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
    CREATE INDEX IF NOT EXISTS idx_commits_v4_project ON commits_v4(project_id);
    CREATE INDEX IF NOT EXISTS idx_commits_v4_branch ON commits_v4(branch);
    CREATE INDEX IF NOT EXISTS idx_commits_v4_created_at ON commits_v4(created_at);

    -- Leaves table (application layer - owns constraints, output, validation)
    CREATE TABLE IF NOT EXISTS leaves (
      id TEXT PRIMARY KEY,
      commit_hash TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,

      -- Constraints (REQUIRE/EXCLUDE rules)
      constraints JSONB NOT NULL DEFAULT '[]',

      -- Configuration
      config JSONB NOT NULL DEFAULT '{}',

      -- Output
      output TEXT,
      generated_at TIMESTAMPTZ,

      -- Validation results
      assertions JSONB,

      -- Metadata
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_leaves_commit ON leaves(commit_hash);
    CREATE INDEX IF NOT EXISTS idx_leaves_project ON leaves(project_id);
    CREATE INDEX IF NOT EXISTS idx_leaves_type ON leaves(type);

    -- Pins table (source selection for commit sources + conversation context)
    CREATE TABLE IF NOT EXISTS pins (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      selected_assertion_ids JSONB,
      pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      pinned_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pins_project ON pins(project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pins_unique ON pins(project_id, type, ref_id);

    -- Conversation Contexts table (per-conversation context customization)
    CREATE TABLE IF NOT EXISTS conversation_contexts (
      conversation_id TEXT PRIMARY KEY REFERENCES conversations(conversation_id) ON DELETE CASCADE,
      selected_pin_ids JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Leaf History table (generation history for leaves)
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

    -- Migration: Add merge_summary column to existing commits_v4 tables (v4.1)
    ALTER TABLE commits_v4 ADD COLUMN IF NOT EXISTS merge_summary JSONB;

    -- Migration: Add runner_assertions column to existing leaves tables (v4.1)
    ALTER TABLE leaves ADD COLUMN IF NOT EXISTS runner_assertions JSONB;

    -- Saved Comparisons table (persisted A/B comparison snapshots)
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

    -- Templates table (reusable prompt templates for leaf generation)
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
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
    CREATE INDEX IF NOT EXISTS idx_templates_leaf_type ON templates(leaf_type);

    -- Drafts V3 table (Workbench / pre-commit working area)
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
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_drafts_v3_project ON drafts_v3(project_id);
    CREATE INDEX IF NOT EXISTS idx_drafts_v3_status ON drafts_v3(status);

    -- Migration: Add foreign key constraints to existing deploy_agents/runs tables (v1.2)
    -- Note: These constraints are in CREATE TABLE for new databases, but existing databases
    -- created before v1.2 won't have them. This migration adds them safely.
    -- Exception handling:
    --   - duplicate_object: constraint already exists (skip)
    --   - undefined_table: table doesn't exist yet (skip)
    --   - foreign_key_violation: orphan data exists (skip, API layer validates)
    DO $$
    BEGIN
      ALTER TABLE deploy_agents
        ADD CONSTRAINT fk_deploy_agents_project
        FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
      WHEN foreign_key_violation THEN
        RAISE NOTICE 'Skipping FK constraint on deploy_agents: orphan project_id values exist. API layer will validate.';
    END $$;

    DO $$
    BEGIN
      ALTER TABLE runs
        ADD CONSTRAINT fk_runs_project
        FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
      WHEN foreign_key_violation THEN
        RAISE NOTICE 'Skipping FK constraint on runs: orphan project_id values exist. API layer will validate.';
    END $$;
  `);
}
