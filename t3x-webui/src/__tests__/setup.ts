/**
 * Test Setup for t3x-webui
 *
 * Provides isolated PGLite database for API route tests.
 * Mocks the database singleton so API routes use test database.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { AnyDB } from '@t3x/storage';
import { vi } from 'vitest';

// Import schema tables for drizzle
import {
  projects,
  conversations,
  turns,
  branches,
  commits,
  drafts,
  mergeResults,
  segmentEmbeddings,
} from '@t3x/storage';

const schema = {
  projects,
  conversations,
  turns,
  branches,
  commits,
  drafts,
  mergeResults,
  segmentEmbeddings,
};

// SQL to create all tables (matching schema.ts)
const CREATE_TABLES_SQL = `
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
`;

// Shared test database instance
let testDB: AnyDB | null = null;
let testClient: PGlite | null = null;

/**
 * Create a fresh test database
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
 * Set up test database and mock getDB
 * Call this in beforeAll of each test file
 */
export async function setupTestDB(): Promise<{
  db: AnyDB;
  cleanup: () => Promise<void>;
}> {
  const { db, client, cleanup } = await createTestDB();
  testDB = db;
  testClient = client;

  return { db, cleanup };
}

/**
 * Get the current test database
 */
export function getTestDB(): AnyDB {
  if (!testDB) {
    throw new Error('Test database not initialized. Call setupTestDB() in beforeAll');
  }
  return testDB;
}

/**
 * Create a mock NextRequest for testing API routes
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Request {
  const { method = 'GET', body, headers = {} } = options;

  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body && method !== 'GET') {
    init.body = JSON.stringify(body);
  }

  return new Request(url, init);
}

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

/**
 * Mock the database module
 */
export function mockDatabaseModule(db: AnyDB) {
  vi.mock('@/lib/db', () => ({
    getDB: vi.fn().mockResolvedValue(db),
  }));
}
