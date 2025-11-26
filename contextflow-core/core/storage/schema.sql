-- ContextFlow SQLite 索引层 Schema
-- 按照 docs/STORAGE_ARCHITECTURE.md 规范

-- ============================================================
-- 1. projects 表
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    meta_json TEXT  -- 可选元数据
);

-- ============================================================
-- 2. conversations 表
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
    conversation_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT,
    created_at TEXT NOT NULL,
    meta_json TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_project
    ON conversations(project_id);

-- ============================================================
-- 3. turns 表（索引 Turn Ledger）
-- ============================================================
CREATE TABLE IF NOT EXISTS turns (
    turn_hash TEXT PRIMARY KEY,
    parent_turn_hash TEXT,
    project_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL,

    -- JSONL 位置信息（用于快速读取原始数据）
    ledger_file TEXT NOT NULL,      -- JSONL 文件路径
    ledger_offset INTEGER NOT NULL, -- 文件内行号

    FOREIGN KEY (project_id) REFERENCES projects(project_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id),
    FOREIGN KEY (parent_turn_hash) REFERENCES turns(turn_hash)
);

CREATE INDEX IF NOT EXISTS idx_turns_conversation
    ON turns(conversation_id);
CREATE INDEX IF NOT EXISTS idx_turns_project
    ON turns(project_id);
CREATE INDEX IF NOT EXISTS idx_turns_parent
    ON turns(parent_turn_hash);

-- ============================================================
-- 4. drafts 表（索引 Draft Ledger）
-- ============================================================
CREATE TABLE IF NOT EXISTS drafts (
    draft_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    base_commit_hash TEXT NOT NULL,
    turn_anchor_hash TEXT,
    bridge_id TEXT NOT NULL,
    bridge_payload_json TEXT NOT NULL,
    must_have_json TEXT,
    mustnt_have_json TEXT,
    llm_config_json TEXT NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL,  -- ephemeral | adopted | superseded
    created_at TEXT NOT NULL,

    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE INDEX IF NOT EXISTS idx_drafts_project
    ON drafts(project_id);
CREATE INDEX IF NOT EXISTS idx_drafts_base_commit
    ON drafts(base_commit_hash);

-- ============================================================
-- 5. commits 表（索引 Commit Ledger）
-- ============================================================
CREATE TABLE IF NOT EXISTS commits (
    commit_hash TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    branch TEXT NOT NULL,
    parents_json TEXT NOT NULL,  -- JSON 数组，如 ["sha256:...", ...]

    -- Turn 窗口
    turn_window_start_hash TEXT,
    turn_window_end_hash TEXT,

    -- Facet 快照与配置
    facet_snapshot_json TEXT NOT NULL,
    pipeline_config_json TEXT NOT NULL,

    -- Draft 引用
    draft_id TEXT,
    draft_text_hash TEXT,  -- Draft 文本的哈希（用于验证引用）

    -- 签名
    signature_key_id TEXT,
    signature_value TEXT,

    created_at TEXT NOT NULL,
    schema_version TEXT NOT NULL,

    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE INDEX IF NOT EXISTS idx_commits_project
    ON commits(project_id);
CREATE INDEX IF NOT EXISTS idx_commits_branch
    ON commits(branch);
CREATE INDEX IF NOT EXISTS idx_commits_draft
    ON commits(draft_id);

-- ============================================================
-- 6. diffs 表（语义 diff 缓存）
-- ============================================================
CREATE TABLE IF NOT EXISTS diffs (
    base_commit_hash TEXT NOT NULL,
    target_commit_hash TEXT NOT NULL,
    algo_version TEXT NOT NULL,
    diff_json TEXT NOT NULL,
    computed_at TEXT NOT NULL,

    PRIMARY KEY (base_commit_hash, target_commit_hash, algo_version)
);

CREATE INDEX IF NOT EXISTS idx_diffs_base
    ON diffs(base_commit_hash);
CREATE INDEX IF NOT EXISTS idx_diffs_target
    ON diffs(target_commit_hash);
