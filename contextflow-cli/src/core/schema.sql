PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO meta(key,value) VALUES ('generation','0');

CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL,
  actor   TEXT NOT NULL,
  kind    TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  project  TEXT NOT NULL,
  ts       TEXT NOT NULL,
  role     TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
  text     TEXT NOT NULL,
  canon    TEXT NOT NULL,
  hash     TEXT NOT NULL UNIQUE,
  tags     TEXT
);
CREATE INDEX IF NOT EXISTS idx_turns_project_ts ON turns(project, ts);
CREATE INDEX IF NOT EXISTS idx_turns_hash ON turns(hash);

CREATE TABLE IF NOT EXISTS drafts (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  ts      TEXT NOT NULL,
  kind    TEXT NOT NULL,
  content TEXT NOT NULL,
  state   TEXT NOT NULL CHECK(state IN ('open','ready','committed')) DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS commits (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project          TEXT NOT NULL,
  ts               TEXT NOT NULL,
  message          TEXT NOT NULL,
  evidence         TEXT NOT NULL,
  parent_commit_id INTEGER,
  hash             TEXT NOT NULL UNIQUE,
  signature        TEXT,
  FOREIGN KEY(parent_commit_id) REFERENCES commits(id)
);

CREATE TABLE IF NOT EXISTS embeddings (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  target TEXT NOT NULL,
  model  TEXT NOT NULL,
  dim    INTEGER NOT NULL,
  vec    BLOB NOT NULL,
  UNIQUE(project, target, model)
);

-- ============================================================
-- V2 Tables: Full storage layer (Python core_api migration)
-- ============================================================

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT,
  parent_commit_hash TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_conversations_parent_commit ON conversations(parent_commit_hash);

-- Turns V2 table (with hash chain)
CREATE TABLE IF NOT EXISTS turns_v2 (
  turn_hash TEXT PRIMARY KEY,
  parent_turn_hash TEXT,
  project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
  content TEXT NOT NULL,
  language TEXT,
  rings_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY(conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_turns_v2_conversation ON turns_v2(conversation_id);
CREATE INDEX IF NOT EXISTS idx_turns_v2_project ON turns_v2(project_id);
CREATE INDEX IF NOT EXISTS idx_turns_v2_parent ON turns_v2(parent_turn_hash);

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
  branch_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_branch TEXT,
  head_commit_hash TEXT,
  description TEXT,
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, name),
  FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_branches_project ON branches(project_id);

-- Commits V2 table (with hash chain)
CREATE TABLE IF NOT EXISTS commits_v2 (
  commit_hash TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  branch TEXT NOT NULL,
  message TEXT,
  parents_json TEXT NOT NULL,
  turn_window_json TEXT NOT NULL,
  facet_snapshot_json TEXT NOT NULL,
  pipeline_config_json TEXT,
  draft_id TEXT,
  draft_text_hash TEXT,
  signature_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_commits_v2_project ON commits_v2(project_id);
CREATE INDEX IF NOT EXISTS idx_commits_v2_branch ON commits_v2(branch);
CREATE INDEX IF NOT EXISTS idx_commits_v2_draft ON commits_v2(draft_id);

-- Drafts V2 table
CREATE TABLE IF NOT EXISTS drafts_v2 (
  draft_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  base_commit_hash TEXT,
  turn_anchor_hash TEXT,
  bridge_id TEXT NOT NULL,
  bridge_payload_json TEXT NOT NULL,
  must_have_json TEXT,
  mustnt_have_json TEXT,
  llm_config_json TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ephemeral','adopted','superseded')) DEFAULT 'ephemeral',
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY(conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_drafts_v2_project ON drafts_v2(project_id);
CREATE INDEX IF NOT EXISTS idx_drafts_v2_base_commit ON drafts_v2(base_commit_hash);

-- Merge results table
CREATE TABLE IF NOT EXISTS merge_results (
  merge_result_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  base_commit_hash TEXT NOT NULL,
  source_commit_hash TEXT NOT NULL,
  target_commit_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('clean','conflicts')),
  auto_merged_json TEXT NOT NULL,
  conflicts_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_merge_results_project ON merge_results(project_id);
