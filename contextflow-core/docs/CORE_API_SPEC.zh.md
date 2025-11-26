# ContextFlow Core API 规范 v1.0

**版本**: 1.0.0
**最后更新**: 2025-11-19
**状态**: Draft

---

## 0. 文档导读

### 0.1 协议优先（Protocol First）

- **本规范定义 ContextFlow 的 HTTP API 契约**
- 任何语言实现只要遵守本规范，即为兼容的 ContextFlow 服务
- 客户端应依赖协议规范，而非特定实现细节

### 0.2 架构分层

```
┌─────────────────────────────────────────────────────────┐
│  第三层：Extensions（可选）                              │
│  - 认证 / HTTPS / CORS / 审计日志                       │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│  第二层：Agentic Layer（可选）                          │
│  - Draft API（LLM orchestration）                       │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│  第一层：Framework Core（必选）                         │
│  - Projects / Conversations / Turns                     │
│  - Commits / Diff / Merge / Export                      │
└─────────────────────────────────────────────────────────┘
```

### 0.3 最小兼容子集（MVP Core）

**必选端点**：
- `GET /health`
- `POST/GET /api/v1/projects`
- `POST/GET /api/v1/conversations`
- `POST/GET /api/v1/turns`, `GET /api/v1/turns/{turn_hash}`
- `POST/GET /api/v1/commits`, `GET /api/v1/commits/{commit_hash}`
- `POST /api/v1/diff`
- `GET /api/v1/export/cfpack`

**增值端点**：`POST /api/v1/merge`, `GET /api/v1/export/ledger`, `GET /api/v1/status`

**Agentic 端点**（可选）：`POST/GET/PATCH /api/v1/agent/drafts`

---

## 1. 通用约定

### 1.1 API 版本
- 所有端点使用前缀：`/api/v1`
- 主版本号递增表示不兼容变更

### 1.2 请求格式
- **Content-Type**: `application/json`
- **时间格式**: ISO 8601 (UTC)，如 `2025-11-19T10:30:00Z`
- **哈希格式**: `sha256:...` 前缀标识算法

### 1.3 响应格式

**成功响应**：
```json
{"status": "ok", "data": {...}}
```

**错误响应**：
```json
{"status": "error", "error": {"code": "ERROR_CODE", "message": "...", "details": {}}}
```

**标准错误码**：

| 错误码 | HTTP | 说明 |
|--------|------|------|
| `INVALID_TURN_HASH` | 400 | Turn 哈希校验失败 |
| `INVALID_COMMIT_HASH` | 400 | Commit 哈希校验失败 |
| `PROJECT_NOT_FOUND` | 404 | 项目不存在 |
| `CONVERSATION_NOT_FOUND` | 404 | 对话不存在 |
| `PARENT_NOT_FOUND` | 404 | 父节点不存在 |
| `HASH_CHAIN_BROKEN` | 409 | 哈希链断裂 |

### 1.4 分页

使用 `limit`（默认50）和 `offset`（默认0）参数，响应包含：
```json
{"pagination": {"total": 1523, "limit": 50, "offset": 100, "has_more": true}}
```

---

## 2. Framework Core API（必选）

> 这些端点**不依赖 LLM**，完全决定论、可复现。

### 2.1 健康检查

#### `GET /health`
不挂在 `/api/v1` 下，便于 LB/K8s 使用。

**响应**：`{"status": "ok", "version": "1.0.0", "uptime": 3600}`

---

### 2.2 项目管理

#### `POST /api/v1/projects`
**请求**：`{"name": "my-project", "metadata": {...}}`
**响应**：返回 `project_id`, `name`, `created_at`

#### `GET /api/v1/projects`
**查询参数**：`limit`, `offset`
**响应**：项目列表，含 `conversations_count`, `turns_count`

#### `GET /api/v1/projects/{project_id}`
**响应**：项目详情，含 `metadata` 和 `stats`

---

### 2.3 对话管理

#### `POST /api/v1/conversations`
**请求**：`{"project_id": "...", "title": "...", "metadata": {...}}`
**响应**：返回 `conversation_id`, `project_id`, `title`, `created_at`

#### `GET /api/v1/conversations`
**查询参数**：`project_id`（必需），`limit`, `offset`
**响应**：对话列表，含 `turns_count`

---

### 2.4 Turn 管理

#### `POST /api/v1/turns`

> **重要约束**：
> - 服务端根据 `conversation_id` **自动确定** `parent_turn_hash`
> - 客户端**不得**指定 `parent_turn_hash`，保证 append-only 语义

**请求**：
```json
{
  "project_id": "...",
  "conversation_id": "...",
  "role": "user|assistant|system|tool",
  "content": "..."
}
```

**响应**：返回 `turn_hash`, `parent_turn_hash`（服务端生成）, `created_at`

#### `GET /api/v1/turns`

> **响应策略**：列表查询**不返回** `rings` 字段，减轻带宽负担。

**查询参数**：`project_id`（必需），`conversation_id`, `role`, `limit`, `offset`

#### `GET /api/v1/turns/{turn_hash}`

返回完整 Turn 详情，**包含 Rings**：

> **重要约束**：**不暴露** `embedding_vector`（向量属于内部数据）

**Ring 字段**：
- **Ring 1**：`keywords`, `entities`, `time_anchor`, `preference_keywords`
- **Ring 2**：`intent_seed`, `time_window`, `preference_soft`, `unknown_slot`, `facets`
- **Ring 3**：`segments`（分句列表）

---

### 2.5 分支管理

#### `POST /api/v1/branches`
**请求**：`{"project_id": "...", "name": "...", "from_branch": "main", "description": "...", "checkout": false}`
**响应**：返回 `branch_id`, `name`, `is_current`, `created_at`

#### `GET /api/v1/branches`
**查询参数**：`project_id`（必需），`limit`, `offset`
**响应**：分支列表，含 `is_current`, `head_commit_hash`, `parent_branch`

#### `POST /api/v1/branches/switch`
**请求**：`{"project_id": "...", "name": "...", "create": false, "from_branch": "...", "description": "..."}`
**响应**：返回 `current_branch`, `head_commit_hash`

#### `DELETE /api/v1/branches`
**请求**：`{"project_id": "...", "name": "...", "force": false}`
**响应**：返回 `{"deleted": "branch-name"}`

#### `GET /api/v1/branches/current`
**查询参数**：`project_id`（必需）
**响应**：返回 `current_branch`, `head_commit_hash`

---

### 2.6 Commit 管理

#### `POST /api/v1/commits`

**请求**：
```json
{
  "project_id": "...",
  "conversation_id": "...",
  "branch": "main",
  "message": "...",
  "turn_window": {"start_turn_hash": "...", "end_turn_hash": "..."},
  "draft_id": "...",
  "sign": false
}
```

**字段说明**：
- `turn_window`：Commit 覆盖的 Turn 范围（必需）
- `draft_id`：关联的 Draft ID（可选）
- `sign`：是否使用 Ed25519 签名（默认 false）

**响应**：返回 `commit_hash`, `branch`, `parent_hashes`, `turn_window`, `draft_ref`, `created_at`

#### `GET /api/v1/commits`
**查询参数**：`project_id`（必需），`branch`, `limit`, `offset`
**响应**：Commit 列表，含 `commit_hash`, `branch`, `message`, `parent_hashes`, `created_at`

#### `GET /api/v1/commits/{commit_hash}`
**响应**：完整 Commit 详情，含 `facet_snapshot`, `pipeline_config`, `draft_ref`, `signature`

---

### 2.7 Diff 操作

#### `POST /api/v1/diff`

**请求**：`{"base_commit_hash": "...", "target_commit_hash": "..."}`

**响应**：
```json
{
  "diff": {
    "facet_changes": [{
      "facet": "goal",
      "change_type": "added|removed|modified",
      "base_text": "...",
      "target_text": "...",
      "added_keywords": [...],
      "removed_keywords": [...]
    }],
    "segment_changes": [{
      "segment_id": "...",
      "change_type": "...",
      "text": "...",
      "similarity_to_base": 0.12
    }]
  },
  "computed_at": "..."
}
```

---

### 2.8 Merge 操作

#### `POST /api/v1/merge`

> **重要设计**：
> - Merge 是**决定论操作**，返回 `merge_result`（非 `draft_id`）
> - 若需要生成合并建议文案，应通过 Agentic 层 Draft API

**请求**：
```json
{
  "project_id": "...",
  "base_commit_hash": "...",
  "source_commit_hash": "...",
  "target_commit_hash": "..."
}
```

**响应**：
- `merge_result_id`
- `status`: `clean` | `conflicts`
- `auto_merged_facets`: 无冲突的 facet 列表
- `conflicts`: 冲突列表，含三方内容与证据
- `auto_merged_count`, `conflict_count`

---

### 2.9 Export 操作

#### `GET /api/v1/export/cfpack`

导出项目为 `.cfpack` 格式（单文件 JSON 归档）。

**查询参数**：`project_id`（必需），`include_drafts`（默认 false）

**响应头**：
```http
Content-Type: application/vnd.contextflow.cfpack+json
Content-Disposition: attachment; filename="proj_xxx.cfpack"
```

**响应体字段**：
- `turns`：原始对话（含 Ring 1/2/3）
- `findings`：跨 turn 归一后的语义事实
- `commits`：含 `facet_snapshot` 及 `pipeline_config`
- `hash`：包级哈希，用于验证完整性

---

## 3. Agentic Layer API（可选）

> 这些端点**依赖 LLM orchestration**，不影响框架兼容性。

### 3.1 Draft API

#### `POST /api/v1/agent/drafts`

本实现采用**同步执行**，流程：嵌入筛选 → LLM polish → Must-Have 验证 → 循环直到通过。

**请求**：
```json
{
  "project_id": "...",
  "conversation_id": "...",
  "base_commit_hash": "...",
  "turn_anchor_hash": "...",
  "bridge_id": "plan|summary|explain|clarify",
  "intent": "...",
  "llm_config": {"provider": "anthropic", "model": "claude-3-5-sonnet-20241022", "temperature": 0.3}
}
```

**响应**：返回 `draft_id`, `status`, `text`, `must_have`, `mustnt_have`, `validation`

#### `GET /api/v1/agent/drafts/{draft_id}`
获取已创建的 Draft。

#### `PATCH /api/v1/agent/drafts/{draft_id}`
**请求**：`{"feedback": "...", "append_must_have": [...]}`
**响应**：更新后的 Draft

---

## 4. Extensions（扩展功能）

### 4.1 系统状态

#### `GET /api/v1/status`
**查询参数**：`project_id`（可选）
**响应**：`projects_count`, `conversations_count`, `turns_count`, `commits_count`, `storage`

### 4.2 Ledger 导出

#### `GET /api/v1/export/ledger`
**查询参数**：`project_id`（必需），`type`（可选：`turn|commit|draft`）
**响应**：`application/x-ndjson` 流式格式

### 4.3 认证（可选）

**默认**：本地 `127.0.0.1`，无认证

**扩展**：启用 `CF_AUTH_ENABLED=true` 和 `CF_AUTH_TOKEN`，客户端使用 `Authorization: Bearer ...`

---

## 5. 实现检查清单

### MVP Core 必选项
- [ ] 所有必选端点
- [ ] Turn 父指针由服务端自动维护
- [ ] 统一响应格式 `{status, data, error}`
- [ ] 哈希格式 `sha256:` 前缀
- [ ] 时间格式 ISO 8601 (UTC)
- [ ] 不暴露 `embedding_vector`
- [ ] 列表查询不返回 `rings`

### 增值功能
- [ ] Merge / Ledger 导出 / Status
- [ ] 分页 / CORS / OpenAPI 文档

---

## 6. 变更日志

### v1.0.0 (2025-11-19)
- 初始版本，定义三层架构
- 核心约束：Turn 父指针自动维护、不暴露向量、Merge 返回决定论结果

---

**附录**：
- OpenAPI 文档：访问 `/docs` 或 `/redoc`
- 哈希算法基于 [JCS](https://tools.ietf.org/html/rfc8785)
