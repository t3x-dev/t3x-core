3.3 存储层（Ledger + 索引）

ContextFlow 的存储分为两层：

1. **JSONL 主账本（Ledger）**：所有可审计、可复现的语义状态（Turn 链、Commit 链等）都以 JSON Lines 形式落在 `.contextflow/` 目录下，采用 JCS 规范化 + SHA-256 哈希形成只追加哈希链。
2. **SQLite 索引层（Index）**：本地 SQLite 数据库只负责查询加速、关联和缓存，可以随时从 JSONL 主账本完整重建，不被视为唯一真相来源。

后续如接入 Postgres / S3 等后端，只需要复用同一套「Ledger JSON 结构」，替换索引实现即可。

---

### 3.3.1 JSONL 主账本

主账本按实体拆分为多条 JSONL 流，位于 `.contextflow/` 下（实际路径以 `STORAGE_ARCHITECTURE.md` 为准）。每行是一条记录，JCS 规范化后进行哈希。

#### （1）Turn Ledger

记录原始对话轮次及其哈希链：

```json
{
  "turn_hash": "sha256:...",          // JCS(此记录) 的 SHA-256，作为主键
  "parent_turn_hash": "sha256:...",   // 上一个 turn_hash；根 turn 为 null
  "project_id": "proj_...",
  "conversation_id": "conv_...",
  "role": "user|assistant|system|tool",
  "content": "...",                   // 原始文本或结构化 payload
  "metadata": { ... },                // 可选：模型名、token 统计等
  "created_at": "2025-11-18T12:34:56Z",
  "schema_version": "turn_v1"
}
```

- 哈希规则：`turn_hash = SHA256(JCS(record_without_hash))`。
- 只追加保证：任何修改 turn 内容或元数据都会改变 `turn_hash`，从而破坏链路，方便审计。

#### （2）Commit Ledger

记录不可变的语义快照及其 DAG 结构：

```json
{
  "commit_hash": "sha256:...",        // 对 commit payload 的哈希
  "parent_hashes": ["sha256:..."],    // 一般为 0–1 个；Merge 时可为多个
  "project_id": "proj_...",
  "branch": "main|feature/...",       // 该 commit 所在分支名
  "turn_window": {
    "start_turn_hash": "sha256:...",
    "end_turn_hash": "sha256:..."
  },
  "facet_snapshot": [ ... ],          // Ring 1–3 聚合后的稳定语义面
  "pipeline_config": { ... },         // extractor / aggregator / 权重 等配置快照
  "draft_ref": {
    "draft_id": "draft_...",
    "text_hash": "sha256:..."         // polished 文本的哈希
  },
  "signature": {
    "key_id": "ed25519:...",
    "algo": "ed25519",
    "value": "base64:..."
  },
  "created_at": "2025-11-18T12:34:56Z",
  "schema_version": "commit_v1"
}
```

- Merge 不单独成为新实体，而是：`parent_hashes.length > 1` 的 Commit。
- Commit 的 canonical payload（参与哈希与签名）包含 facet 快照与 pipeline 配置，保证之后可以重放 / 验证。

#### （3）Draft Ledger（可选持久化）

Draft 是基于某个 base 快照生成的候选稿，为了保证 Draft→Commit 可复现，至少需要持久化其配置：

```json
{
  "draft_id": "draft_...",
  "project_id": "proj_...",
  "base_commit_hash": "sha256:...",   // 以哪个语义快照为基准
  "turn_anchor_hash": "sha256:...",   // 可选：挂靠的焦点 turn
  "bridge_id": "plan|rewrite|...",    // Draft 模式/bridge 名称
  "bridge_payload": { ... },          // bridge prompt 模板与参数快照
  "must_have": [ ... ],               // Must-Have 列表
  "mustnt_have": [ ... ],             // Mustn't-Have 列表
  "llm_config": {                     // 影响输出的生成配置
    "provider": "openai|anthropic|...",
    "model": "gpt-4.1|claude-3.5-sonnet|...",
    "temperature": 0.3,
    "max_tokens": 2048
  },
  "text": "...",                      // 生成的草稿文本
  "status": "ephemeral|adopted|superseded",
  "created_at": "2025-11-18T12:34:56Z",
  "schema_version": "draft_v1"
}
```

Commit 可以只引用 `draft_id`，也可以在自身 payload 中内嵌一份精简配置副本，用于长期存档。

其他辅助 Ledger（例如 branch 元数据、验证日志）可在 `STORAGE_ARCHITECTURE.md` 中补充，这里不展开。

---

### 3.3.2 SQLite 索引层（参考 schema）

SQLite 作为本地查询索引，所有数据都可以从 JSONL Ledger 完全重建。核心表如下，仅列出关键字段及约束（实际 DDL 以 `schema.sql` 为准）。

#### （1）projects

- `project_id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `created_at TEXT NOT NULL`

与 Ledger 里所有记录的 `project_id` 对齐。

#### （2）conversations

- `conversation_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL` → `projects.project_id`
- `title TEXT`
- `created_at TEXT NOT NULL`
- `meta_json TEXT`

Conversation 更像“容器”，不再单独搞哈希链；历史由 `turns` 链保证。

#### （3）turns

- `turn_hash TEXT PRIMARY KEY`           // 对应 Turn Ledger 的 `turn_hash`
- `parent_turn_hash TEXT`
- `project_id TEXT NOT NULL`
- `conversation_id TEXT NOT NULL`
- `role TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `ledger_file TEXT NOT NULL`            // JSONL 文件路径
- `ledger_offset INTEGER NOT NULL`       // 文件内行号/偏移

约束（逻辑上）：

- `parent_turn_hash` 要么为 `NULL`，要么指向同一 `project_id` 下的另一行；
- 实现层面避免对 `turns` 做 `UPDATE/DELETE`，从而保持与 Ledger append-only 一致。

#### （4）drafts

- `draft_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `base_commit_hash TEXT NOT NULL`
- `turn_anchor_hash TEXT`
- `bridge_id TEXT NOT NULL`
- `bridge_payload_json TEXT NOT NULL`
- `must_have_json TEXT`
- `mustnt_have_json TEXT`
- `llm_config_json TEXT NOT NULL`
- `text TEXT NOT NULL`
- `status TEXT NOT NULL`
- `created_at TEXT NOT NULL`

这些字段与 Draft Ledger 的 JSON 结构一一对应，方便在 CLI / WebUI 中查询与过滤。

#### （5）commits

- `commit_hash TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `branch TEXT NOT NULL`
- `parents_json TEXT NOT NULL`
- `turn_window_start_hash TEXT`
- `turn_window_end_hash TEXT`
- `facet_snapshot_json TEXT NOT NULL`
- `pipeline_config_json TEXT NOT NULL`
- `draft_id TEXT`
- `polished_text TEXT`
- `signature_key_id TEXT`
- `signature_value TEXT`
- `created_at TEXT NOT NULL`
- `schema_version TEXT NOT NULL`

Merge 不再单独建表；多父关系完全由 `parents_json` 表达。

#### （6）diffs（缓存）

- `base_commit_hash TEXT NOT NULL`
- `target_commit_hash TEXT NOT NULL`
- `algo_version TEXT NOT NULL`
- `diff_json TEXT NOT NULL`
- `computed_at TEXT NOT NULL`

主键：`(base_commit_hash, target_commit_hash, algo_version)`。

说明：

- `diffs` 只作为缓存层，可以安全清空并从 Commit Ledger 重算；
- 不参与任何哈希链与签名，不被视作“不可篡改账本”的一部分。

---

这一版结构做到：

- 把 JSONL 作为主账本、SQLite 作为索引 的边界说清楚；
- 明确了 Turn/Commit 的哈希链、Commit DAG、多父 Merge 的语义；
- 给 Draft、Commit、Diff 都补上了“可复现所必需”的字段；
- 没写死具体 DDL，但重构 SQLite 时已有足够明确的目标。
