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
const SCHEMA_VERSION = 41;

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

    -- Auto-migrate: rename legacy turns_v2 table if it exists
    ALTER TABLE IF EXISTS turns_v2 RENAME TO turns;
    ALTER INDEX IF EXISTS idx_turns_v2_conversation RENAME TO idx_turns_conversation;
    ALTER INDEX IF EXISTS idx_turns_v2_project RENAME TO idx_turns_project;
    ALTER INDEX IF EXISTS idx_turns_v2_parent RENAME TO idx_turns_parent;

    -- Turns table
    CREATE TABLE IF NOT EXISTS turns (
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
    CREATE INDEX IF NOT EXISTS idx_turns_conversation ON turns(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_turns_project ON turns(project_id);
    CREATE INDEX IF NOT EXISTS idx_turns_parent ON turns(parent_turn_hash);

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
      turn_hash TEXT NOT NULL REFERENCES turns(turn_hash) ON DELETE CASCADE,
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
    -- V4 Architecture Tables (commits_v4 RETIRED — use 'commits' table)
    -- ═══════════════════════════════════════════════════════════════════════════

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
      prompt_used TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_leaf_history_leaf ON leaf_history(leaf_id);
    CREATE INDEX IF NOT EXISTS idx_leaf_history_generated_at ON leaf_history(generated_at);

    -- Migration: Add S16 columns to existing leaf_history tables
    ALTER TABLE leaf_history ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE leaf_history ADD COLUMN IF NOT EXISTS prompt_used TEXT;

    -- Migration: Drop dead columns
    ALTER TABLE leaf_history DROP COLUMN IF EXISTS corrective_feedback;
    -- NOTE: yops_log DROP COLUMN moved after CREATE TABLE yops_log (see below)

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

    -- Auto-migrate: rename legacy drafts_v3 table if it exists
    ALTER TABLE IF EXISTS drafts_v3 RENAME TO drafts;
    ALTER INDEX IF EXISTS idx_drafts_v3_project RENAME TO idx_drafts_project;
    ALTER INDEX IF EXISTS idx_drafts_v3_status RENAME TO idx_drafts_status;

    -- Drafts table (Workbench / pre-commit working area)
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
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_drafts_project ON drafts(project_id);
    CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);

    -- Migration: Add LLM extraction columns to drafts (incremental extraction pipeline)
    ALTER TABLE drafts ADD COLUMN IF NOT EXISTS extraction_mode TEXT;
    ALTER TABLE drafts ADD COLUMN IF NOT EXISTS semantic_points_json JSONB;
    ALTER TABLE drafts ADD COLUMN IF NOT EXISTS extraction_cursor_json JSONB;

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

    -- YOps Log table (semantic yops tracking)
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
    -- commit_hash was added then removed; skip for new databases
    ALTER TABLE yops_log DROP COLUMN IF EXISTS commit_hash;
    ALTER TABLE yops_log ADD COLUMN IF NOT EXISTS model TEXT;
    -- V2 columns (agentic pipeline)
    ALTER TABLE yops_log ADD COLUMN IF NOT EXISTS version INTEGER;
    ALTER TABLE yops_log ADD COLUMN IF NOT EXISTS pipeline_state TEXT;
    ALTER TABLE yops_log ADD COLUMN IF NOT EXISTS gate_result_json JSONB;
    ALTER TABLE yops_log ADD COLUMN IF NOT EXISTS metadata JSONB;

    -- Migration: rename delta_log to yops_log if old table exists
    DO $$ BEGIN
      IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'delta_log') THEN
        ALTER TABLE delta_log RENAME TO yops_log;
        ALTER TABLE yops_log RENAME COLUMN delta TO yops;
        ALTER INDEX IF EXISTS idx_delta_log_conv RENAME TO idx_yops_log_conv;
        ALTER INDEX IF EXISTS idx_delta_log_project RENAME TO idx_yops_log_project;
      END IF;
    END $$;

    -- Node Relations (Inter-node Relations)
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
    CREATE INDEX IF NOT EXISTS idx_nr_commit ON node_relations(commit_hash);
    CREATE INDEX IF NOT EXISTS idx_nr_project ON node_relations(project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_nr_pair ON node_relations(commit_hash, source_id, target_id, type);

    -- Rename legacy sentence columns before knowledge graph table references
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_node_members' AND column_name = 'content_sentence_id'
      ) THEN
        ALTER TABLE knowledge_node_members RENAME COLUMN content_sentence_id TO content_node_id;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_knm_content_sentence') THEN
        ALTER INDEX idx_knm_content_sentence RENAME TO idx_knm_content_node;
      END IF;
    END
    $$;

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

    -- Migration: Add autopilot_config column to projects (Knowledge Autopilot)
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS autopilot_config JSONB;

    -- Migration: Add business_rules column to projects (Gate Business Rules)
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS business_rules JSONB DEFAULT '[]';

    -- Migration: Add content_blocks column to turns (Multimodal turns)
    ALTER TABLE turns ADD COLUMN IF NOT EXISTS content_blocks JSONB;

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
    -- Extraction Style Settings (Task 4 — Slot Sources + Extraction Quality)
    -- ═══════════════════════════════════════════════════════════════
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS extraction_style JSONB;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS default_extraction_style JSONB;

    -- ═══════════════════════════════════════════════════════════════
    -- Frame-Based Commits (commits + frame_lineage)
    -- ═══════════════════════════════════════════════════════════════

    -- Auto-migrate: rename legacy commits_v5 table if it exists
    ALTER TABLE IF EXISTS commits_v5 RENAME TO commits;
    ALTER INDEX IF EXISTS idx_commits_v5_project RENAME TO idx_commits_project;
    ALTER INDEX IF EXISTS idx_commits_v5_branch RENAME TO idx_commits_branch;
    ALTER INDEX IF EXISTS idx_commits_v5_committed_at RENAME TO idx_commits_committed_at;

    CREATE TABLE IF NOT EXISTS commits (
      -- First class (in hash)
      hash TEXT PRIMARY KEY,
      schema TEXT NOT NULL DEFAULT 't3x/commit',
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
      yops_log_ids JSONB DEFAULT '[]',
      position_x REAL,
      position_y REAL,

      -- Timestamps
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_commits_project ON commits(project_id);
    CREATE INDEX IF NOT EXISTS idx_commits_branch ON commits(branch);
    CREATE INDEX IF NOT EXISTS idx_commits_committed_at ON commits(committed_at);

    -- Migration: add yops_log_ids to existing commits table
    ALTER TABLE commits ADD COLUMN IF NOT EXISTS yops_log_ids JSONB DEFAULT '[]';

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

  // ── Schema v29: Topics table + topic_id on yops_log ──
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_topics_conv ON topics(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_topics_project ON topics(project_id);

    ALTER TABLE yops_log ADD COLUMN IF NOT EXISTS topic_id TEXT;
  `);

  // ── Schema v30: Trees + Tree Relations tables (live tree state) ──
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS trees (
      conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
      tree_id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      topic_id TEXT,
      type TEXT NOT NULL,
      slots JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      source TEXT NOT NULL,
      slot_quotes JSONB,
      slot_sources JSONB,
      manual_edited BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (conversation_id, tree_id)
    );
    CREATE INDEX IF NOT EXISTS idx_trees_project ON trees(project_id);
    CREATE INDEX IF NOT EXISTS idx_trees_type ON trees(type);
    CREATE INDEX IF NOT EXISTS idx_trees_conv_topic ON trees(conversation_id, topic_id);
    CREATE INDEX IF NOT EXISTS idx_trees_manual ON trees(conversation_id, manual_edited) WHERE manual_edited = true;

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
  `);

  // ── Schema v32: Rename frames → trees (migration for existing databases) ──
  await sql.unsafe(`
    DO $$
    BEGIN
      -- Rename tables if old names still exist
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'frames') THEN
        ALTER TABLE frames RENAME TO trees;
        ALTER TABLE trees RENAME COLUMN frame_id TO tree_id;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'frame_relations') THEN
        ALTER TABLE frame_relations RENAME TO tree_relations;
        ALTER TABLE tree_relations RENAME COLUMN from_frame_id TO from_tree_id;
        ALTER TABLE tree_relations RENAME COLUMN to_frame_id TO to_tree_id;
      END IF;
      -- Rename indexes (safe — no-op if already renamed)
      IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_frames_project') THEN
        ALTER INDEX idx_frames_project RENAME TO idx_trees_project;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_frames_type') THEN
        ALTER INDEX idx_frames_type RENAME TO idx_trees_type;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_frames_conv_topic') THEN
        ALTER INDEX idx_frames_conv_topic RENAME TO idx_trees_conv_topic;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_frames_manual') THEN
        ALTER INDEX idx_frames_manual RENAME TO idx_trees_manual;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_frel_conversation') THEN
        ALTER INDEX idx_frel_conversation RENAME TO idx_trel_conversation;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_frel_topic') THEN
        ALTER INDEX idx_frel_topic RENAME TO idx_trel_topic;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_frel_from') THEN
        ALTER INDEX idx_frel_from RENAME TO idx_trel_from;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_frel_to') THEN
        ALTER INDEX idx_frel_to RENAME TO idx_trel_to;
      END IF;
    END
    $$;
  `);

  // ── Schema v34: Add slot_quotes column to trees table ──
  await sql.unsafe(`
    ALTER TABLE trees ADD COLUMN IF NOT EXISTS slot_quotes JSONB;
  `);

  // ── Schema v35: commit_rewrites — append-only rewrite log ──
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS commit_rewrites (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      branch TEXT NOT NULL,
      operation TEXT NOT NULL,
      source_hashes JSONB NOT NULL,
      result_hash TEXT NOT NULL,
      base_hash TEXT,
      ops_replayed INTEGER NOT NULL,
      yops_log_ids JSONB NOT NULL,
      author JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_commit_rewrites_project ON commit_rewrites(project_id);
    CREATE INDEX IF NOT EXISTS idx_commit_rewrites_result ON commit_rewrites(result_hash);

    -- ═══════════════════════════════════════════════════════════════
    -- Soft Delete support
    -- ═══════════════════════════════════════════════════════════════
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `);

  // ── Schema v38: Conversation alias (snake_case identifiers) ──
  await sql.unsafe(`
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS alias TEXT;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'conversations_alias_format'
      ) THEN
        ALTER TABLE conversations
          ADD CONSTRAINT conversations_alias_format
          CHECK (alias IS NULL OR alias ~ '^[a-z][a-z0-9_]{0,63}$');
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_project_alias
      ON conversations (project_id, alias) WHERE alias IS NOT NULL;
  `);

  // ── Schema v39: events outbox for cross-process realtime sync ──
  await sql.unsafe(`
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
  `);

  // ── Schema v40: event triggers for cross-process realtime sync ──
  // Shared emit helper: inserts into events + fires pg_notify.
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION t3x_emit_event(
      p_type TEXT,
      p_project_id TEXT,
      p_conversation_id TEXT,
      p_payload JSONB
    ) RETURNS BIGINT AS $$
    DECLARE
      new_id BIGINT;
    BEGIN
      INSERT INTO events (type, project_id, conversation_id, payload)
      VALUES (p_type, p_project_id, p_conversation_id, p_payload)
      RETURNING id INTO new_id;
      PERFORM pg_notify('t3x_events', new_id::text);
      RETURN new_id;
    END;
    $$ LANGUAGE plpgsql;

    -- commits INSERT → commit.created
    CREATE OR REPLACE FUNCTION t3x_trg_commit_created() RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.project_id IS NULL THEN RETURN NEW; END IF;
      PERFORM t3x_emit_event(
        'commit.created',
        NEW.project_id,
        NULL,
        jsonb_build_object('hash', NEW.hash, 'branch', NEW.branch)
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_commits_event ON commits;
    CREATE TRIGGER trg_commits_event
      AFTER INSERT ON commits
      FOR EACH ROW EXECUTE FUNCTION t3x_trg_commit_created();

    -- drafts UPDATE → draft.changed (only when updated_at moves)
    CREATE OR REPLACE FUNCTION t3x_trg_draft_changed() RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
        PERFORM t3x_emit_event(
          'draft.changed',
          NEW.project_id,
          NULL,
          jsonb_build_object('draft_id', NEW.id, 'revision', NEW.revision)
        );
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_drafts_event ON drafts;
    CREATE TRIGGER trg_drafts_event
      AFTER UPDATE ON drafts
      FOR EACH ROW EXECUTE FUNCTION t3x_trg_draft_changed();

    -- yops_log INSERT → yops.applied (project_id lives on the row; no join needed)
    CREATE OR REPLACE FUNCTION t3x_trg_yops_applied() RETURNS TRIGGER AS $$
    BEGIN
      PERFORM t3x_emit_event(
        'yops.applied',
        NEW.project_id,
        NEW.conversation_id,
        jsonb_build_object(
          'yops_log_id', NEW.id,
          'op_count', CASE
            WHEN jsonb_typeof(NEW.yops) = 'array' THEN jsonb_array_length(NEW.yops)
            ELSE 1
          END
        )
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_yops_log_event ON yops_log;
    CREATE TRIGGER trg_yops_log_event
      AFTER INSERT ON yops_log
      FOR EACH ROW EXECUTE FUNCTION t3x_trg_yops_applied();

    -- conversations.alias UPDATE → conversation.renamed
    CREATE OR REPLACE FUNCTION t3x_trg_conversation_renamed() RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.alias IS DISTINCT FROM OLD.alias THEN
        PERFORM t3x_emit_event(
          'conversation.renamed',
          NEW.project_id,
          NEW.conversation_id,
          jsonb_build_object('alias', NEW.alias, 'previous_alias', OLD.alias)
        );
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_conversations_alias_event ON conversations;
    CREATE TRIGGER trg_conversations_alias_event
      AFTER UPDATE ON conversations
      FOR EACH ROW EXECUTE FUNCTION t3x_trg_conversation_renamed();
  `);

  // Record schema version so subsequent startups skip the init SQL.
  await sql.unsafe(`
    INSERT INTO _schema_version (singleton, version, applied_at)
    VALUES (TRUE, ${SCHEMA_VERSION}, NOW())
    ON CONFLICT (singleton) DO UPDATE SET version = ${SCHEMA_VERSION}, applied_at = NOW()
  `);
}
