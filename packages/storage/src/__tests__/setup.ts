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

-- Merge Results
CREATE TABLE IF NOT EXISTS merge_results (
  merge_result_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  base_commit_hash TEXT NOT NULL,
  source_commit_hash TEXT NOT NULL,
  target_commit_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  auto_merged_json TEXT NOT NULL,
  conflicts_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
CREATE INDEX IF NOT EXISTS idx_merge_results_project ON merge_results(project_id);
CREATE INDEX IF NOT EXISTS idx_commits_v3_project ON commits_v3(project_id);
CREATE INDEX IF NOT EXISTS idx_commits_v3_branch ON commits_v3(branch);
CREATE INDEX IF NOT EXISTS idx_commits_v3_committed_at ON commits_v3(committed_at);
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
