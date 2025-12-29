/**
 * PostgreSQL Adapter
 *
 * Standard PostgreSQL connection for Docker/production deployments.
 * Uses postgres.js for best performance.
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema';

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
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_commits_v2_project ON commits_v2(project_id);
    CREATE INDEX IF NOT EXISTS idx_commits_v2_branch ON commits_v2(branch);
    CREATE INDEX IF NOT EXISTS idx_commits_v2_draft ON commits_v2(draft_id);

    -- Drafts V2 table
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
      created_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_drafts_v2_project ON drafts_v2(project_id);
    CREATE INDEX IF NOT EXISTS idx_drafts_v2_base_commit ON drafts_v2(base_commit_hash);

    -- Merge Results table
    CREATE TABLE IF NOT EXISTS merge_results (
      merge_result_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
      base_commit_hash TEXT NOT NULL,
      source_commit_hash TEXT NOT NULL,
      target_commit_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      auto_merged_json TEXT NOT NULL,
      conflicts_json TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_merge_results_project ON merge_results(project_id);

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
  `);
}
