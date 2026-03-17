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
 * Schema version — bump this number whenever you add migrations below.
 */
const SCHEMA_VERSION = 28;

/**
 * Initialize database schema (skips if already at current version)
 */
async function initializeSchema(sql: postgres.Sql): Promise<void> {
  // Schema version gate — avoid re-running 900+ lines of idempotent SQL on every restart.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS _schema_version (
      singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
      version   INTEGER NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const rows = await sql.unsafe<{ version: number }[]>(
    `SELECT version FROM _schema_version WHERE singleton = TRUE`
  );

  if (rows.length > 0 && rows[0].version >= SCHEMA_VERSION) {
    return;
  }

  // First run or version bump — execute full schema init
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
      semantic JSONB,
      merkle_root TEXT,
      position_x REAL,
      position_y REAL,

      -- Timestamps
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_commits_v4_project ON commits_v4(project_id);
    CREATE INDEX IF NOT EXISTS idx_commits_v4_branch ON commits_v4(branch);
    CREATE INDEX IF NOT EXISTS idx_commits_v4_created_at ON commits_v4(created_at);

    -- Migration: Add merkle_root column to existing commits_v4 tables
    ALTER TABLE commits_v4 ADD COLUMN IF NOT EXISTS merkle_root TEXT;

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
      created_by TEXT,
      attempt_number INTEGER NOT NULL DEFAULT 1,
      corrective_feedback TEXT,
      prompt_used TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_leaf_history_leaf ON leaf_history(leaf_id);
    CREATE INDEX IF NOT EXISTS idx_leaf_history_generated_at ON leaf_history(generated_at);

    -- Migration: Add S16 columns to existing leaf_history tables
    ALTER TABLE leaf_history ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE leaf_history ADD COLUMN IF NOT EXISTS corrective_feedback TEXT;
    ALTER TABLE leaf_history ADD COLUMN IF NOT EXISTS prompt_used TEXT;

    -- Migration: Add merge_summary column to existing commits_v4 tables (v4.1)
    ALTER TABLE commits_v4 ADD COLUMN IF NOT EXISTS merge_summary JSONB;

    -- Migration: Add semantic column to existing commits_v4 tables
    ALTER TABLE commits_v4 ADD COLUMN IF NOT EXISTS semantic JSONB;

    -- Migration: Add provider/model columns to projects and conversations (PR #554)
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS provider_config TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS default_provider TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS default_model TEXT;
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS provider TEXT;
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS model TEXT;

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
      default_constraints JSONB DEFAULT '[]'::jsonb,
      semantic_threshold JSONB,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
    CREATE INDEX IF NOT EXISTS idx_templates_leaf_type ON templates(leaf_type);

    -- Migration: Add new columns to existing templates tables
    ALTER TABLE templates ADD COLUMN IF NOT EXISTS default_constraints JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE templates ADD COLUMN IF NOT EXISTS semantic_threshold JSONB;

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

    -- Migration: Add LLM extraction columns to drafts_v3 (incremental extraction pipeline)
    ALTER TABLE drafts_v3 ADD COLUMN IF NOT EXISTS extraction_mode TEXT;
    ALTER TABLE drafts_v3 ADD COLUMN IF NOT EXISTS semantic_points_json JSONB;
    ALTER TABLE drafts_v3 ADD COLUMN IF NOT EXISTS extraction_cursor_json JSONB;

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

    -- Migration: Add provider_config column to projects (for project-level provider overrides)
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS provider_config TEXT;

    -- Global Settings table (key-value store for app-wide config)
    CREATE TABLE IF NOT EXISTS global_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- API Keys table (Authentication)
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);

    -- Webhooks table (Event Subscription)
    CREATE TABLE IF NOT EXISTS webhooks (
      webhook_id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      events JSONB NOT NULL,
      secret TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_webhooks_project ON webhooks(project_id);
    CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(active);

    -- Migration: Fix webhooks.active column type (TEXT → INTEGER)
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'webhooks' AND column_name = 'active' AND data_type = 'text'
      ) THEN
        ALTER TABLE webhooks ALTER COLUMN active DROP DEFAULT;
        ALTER TABLE webhooks ALTER COLUMN active TYPE INTEGER USING CASE WHEN active = 'true' THEN 1 ELSE 0 END;
        ALTER TABLE webhooks ALTER COLUMN active SET DEFAULT 1;
      END IF;
    END $$;

    -- ═══════════════════════════════════════════════════════════════════════════
    -- Auth Migration (Phase 1.2)
    -- ═══════════════════════════════════════════════════════════════════════════

    -- Users table (OAuth providers)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      provider TEXT,
      provider_id TEXT,
      email TEXT,
      name TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    -- Note: idx_users_provider_unique removed — Phase 2 migration drops provider/provider_id columns
    -- and moves them to accounts table. Index is no longer needed.

    -- Migration: Add owner_id to projects (nullable — null = public/legacy data)
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

    -- Migration: Add user_id to api_keys (nullable — null = legacy key)
    ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS user_id TEXT;

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

    -- Extraction Feedback table (anchoring L4)
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

    -- Recipes table (automation workflows)
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      trigger JSONB NOT NULL,
      steps JSONB NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Share Tokens table (share links for read-only access)
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

    -- Delta Log table (Frame Semantic Engine — inter-sentence relation deltas)
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
    ALTER TABLE delta_log ADD COLUMN IF NOT EXISTS commit_hash TEXT;
    ALTER TABLE delta_log ADD COLUMN IF NOT EXISTS model TEXT;

    -- Sentence Relations (Inter-sentence Relations)
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
    CREATE INDEX IF NOT EXISTS idx_sr_commit ON sentence_relations(commit_hash);
    CREATE INDEX IF NOT EXISTS idx_sr_project ON sentence_relations(project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sr_pair ON sentence_relations(commit_hash, source_id, target_id, type);

    -- ═══════════════════════════════════════════════════════════════════════════
    -- Knowledge Graph (Cross-conversation entity/topic graph)
    -- ═══════════════════════════════════════════════════════════════════════════

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

    -- Migration: Add autopilot_config column to projects (Knowledge Autopilot)
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS autopilot_config JSONB;

    -- Migration: Add business_rules column to projects (Gate Business Rules)
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS business_rules JSONB DEFAULT '[]';

    -- Migration: Add content_blocks column to turns_v2 (Multimodal turns)
    ALTER TABLE turns_v2 ADD COLUMN IF NOT EXISTS content_blocks JSONB;

    -- ═══════════════════════════════════════════════════════════════
    -- Auth Migration Phase 2: Multi-provider (users + accounts split)
    -- ═══════════════════════════════════════════════════════════════

    -- Accounts table (one row per OAuth provider per user)
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider, provider_account_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

    -- Migrate existing users.provider/provider_id → accounts table
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'provider'
      ) THEN
        INSERT INTO accounts (id, user_id, provider, provider_account_id, created_at)
        SELECT 'acct_' || substr(md5(id || provider), 1, 12), id, provider, provider_id, created_at
        FROM users
        ON CONFLICT DO NOTHING;

        ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

        ALTER TABLE users DROP COLUMN IF EXISTS provider;
        ALTER TABLE users DROP COLUMN IF EXISTS provider_id;
      END IF;
    END $$;

    -- Ensure email_verified column exists (for fresh installs that skip the IF block)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

    -- Unique index on email (partial — only non-null emails)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

    -- Drop old provider unique index (may not exist on fresh installs)
    DROP INDEX IF EXISTS idx_users_provider_unique;

    -- ═══════════════════════════════════════════════════════════════
    -- Auth Migration Phase 3: Local auth (username + password)
    -- ═══════════════════════════════════════════════════════════════
    ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

    -- ═══════════════════════════════════════════════════════════════
    -- Frame-Based Commits (commits_v5 + frame_lineage)
    -- ═══════════════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS commits_v5 (
      -- First class (in hash)
      hash TEXT PRIMARY KEY,
      schema TEXT NOT NULL DEFAULT 't3x/commit/5',
      parents JSONB NOT NULL DEFAULT '[]',
      author JSONB NOT NULL,
      committed_at TIMESTAMPTZ NOT NULL,
      content JSONB NOT NULL,

      -- Second class (not in hash)
      project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
      message TEXT,
      branch TEXT DEFAULT 'main',
      sources JSONB,
      provenance JSONB,
      position_x REAL,
      position_y REAL,

      -- Timestamps
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_commits_v5_project ON commits_v5(project_id);
    CREATE INDEX IF NOT EXISTS idx_commits_v5_branch ON commits_v5(branch);
    CREATE INDEX IF NOT EXISTS idx_commits_v5_committed_at ON commits_v5(committed_at);

    CREATE TABLE IF NOT EXISTS frame_lineage (
      id TEXT PRIMARY KEY,
      commit_hash TEXT NOT NULL,
      frame_id TEXT NOT NULL,
      slot_sources JSONB,
      meta JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_frame_lineage_commit ON frame_lineage(commit_hash);
    CREATE INDEX IF NOT EXISTS idx_frame_lineage_frame ON frame_lineage(frame_id);

    -- Token Usage table (LLM token metering)
    CREATE TABLE IF NOT EXISTS token_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      estimated_cost NUMERIC(10,6) DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_token_usage_user_created ON token_usage(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_token_usage_project_created ON token_usage(project_id, created_at);
  `);

  // pgvector: Try to create sentence_vectors table (graceful — skipped if vector extension unavailable)
  try {
    await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
    await sql.unsafe(`
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
    `);
    // Backfill tsvector for existing rows (idempotent)
    await sql.unsafe(
      `UPDATE sentence_vectors SET tsv = to_tsvector('simple', text) WHERE tsv IS NULL;`
    );
  } catch {
    // pgvector not available — sentence similarity search disabled
  }

  // Record schema version so subsequent startups skip the init SQL.
  await sql.unsafe(`
    INSERT INTO _schema_version (singleton, version, applied_at)
    VALUES (TRUE, ${SCHEMA_VERSION}, NOW())
    ON CONFLICT (singleton) DO UPDATE SET version = ${SCHEMA_VERSION}, applied_at = NOW()
  `);
}
