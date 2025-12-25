# T3X WebUI REST API 规范 v2.0

**版本**: 2.0.0
**最后更新**: 2025-12-23
**状态**: Production

---

## 0. 文档导读

### 0.1 协议优先

- **本规范定义 T3X WebUI 的 REST API 契约**
- 基于 Next.js 15 App Router 实现
- 所有响应使用标准化 JSON 格式

### 0.2 架构分层

```
┌─────────────────────────────────────────────────────────┐
│  产品层: t3x-webui                                       │
│  Next.js 15 App Router + REST API                       │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│  存储层: @t3x/storage                                    │
│  PostgreSQL (Drizzle ORM)                               │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│  核心层: @t3x/core                                       │
│  确定性语义引擎                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 1. 通用规范

### 1.1 基础 URL

```
http://localhost:3000/api/v1
```

### 1.2 响应格式

**成功响应:**
```json
{
  "success": true,
  "data": { ... }
}
```

**错误响应:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### 1.3 命名约定

- API 字段使用 `snake_case`
- 内部 TypeScript 代码使用 `camelCase`

### 1.4 通用错误码

| 错误码 | HTTP 状态 | 描述 |
|--------|----------|------|
| `INVALID_REQUEST` | 400 | 请求格式错误 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

---

## 2. 健康检查 API

### GET /health

检查服务健康状态。

**响应:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-23T10:00:00Z"
}
```

### GET /api/v1/status

获取系统详细状态。

**响应:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "connected",
    "version": "0.1.0"
  }
}
```

---

## 3. 项目 API

### GET /api/v1/projects

列出所有项目。

**响应:**
```json
{
  "success": true,
  "data": [
    {
      "project_id": "proj_abc123",
      "name": "My Project",
      "created_at": "2025-12-23T10:00:00Z",
      "metadata_json": null
    }
  ]
}
```

### POST /api/v1/projects

创建新项目。

**请求体:**
```json
{
  "name": "My Project"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "project_id": "proj_abc123",
    "name": "My Project",
    "created_at": "2025-12-23T10:00:00Z"
  }
}
```

### GET /api/v1/projects/{project_id}

获取项目详情。

### PUT /api/v1/projects/{project_id}

更新项目。

### DELETE /api/v1/projects/{project_id}

删除项目（级联删除所有关联数据）。

---

## 4. 对话 API

### GET /api/v1/conversations

列出对话。

**查询参数:**
- `project_id` (required): 项目 ID

### POST /api/v1/conversations

创建新对话。

**请求体:**
```json
{
  "project_id": "proj_abc123",
  "title": "Planning Session",
  "position_x": 100,
  "position_y": 200
}
```

### GET /api/v1/conversations/{conversation_id}

获取对话详情。

### PUT /api/v1/conversations/{conversation_id}

更新对话。

### DELETE /api/v1/conversations/{conversation_id}

删除对话（级联删除所有 Turn）。

---

## 5. Turn API

### GET /api/v1/turns

列出 Turn。

**查询参数:**
- `conversation_id` (required): 对话 ID

### POST /api/v1/turns

创建新 Turn。

**请求体:**
```json
{
  "project_id": "proj_abc123",
  "conversation_id": "conv_xyz789",
  "parent_turn_hash": "sha256:...",
  "role": "user",
  "content": "Hello, world!",
  "language": "en"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "turn_hash": "sha256:abc123...",
    "parent_turn_hash": "sha256:...",
    "project_id": "proj_abc123",
    "conversation_id": "conv_xyz789",
    "role": "user",
    "content": "Hello, world!",
    "language": "en",
    "rings_json": null,
    "created_at": "2025-12-23T10:00:00Z"
  }
}
```

### GET /api/v1/turns/{turn_hash}

获取单个 Turn。

### GET /api/v1/turns/{turn_hash}/chain

获取 Turn 链（从指定 Turn 回溯到根）。

---

## 6. 分支 API

### GET /api/v1/branches

列出分支。

**查询参数:**
- `project_id` (required): 项目 ID

### POST /api/v1/branches

创建新分支。

**请求体:**
```json
{
  "project_id": "proj_abc123",
  "name": "feature/experiment",
  "parent_branch": "main",
  "description": "Experimental branch"
}
```

### GET /api/v1/branches/current

获取当前分支。

**查询参数:**
- `project_id` (required): 项目 ID

### POST /api/v1/branches/switch

切换当前分支。

**请求体:**
```json
{
  "project_id": "proj_abc123",
  "branch_name": "feature/experiment"
}
```

---

## 7. Commit API

### GET /api/v1/commits

列出 Commit。

**查询参数:**
- `project_id` (required): 项目 ID
- `branch` (optional): 分支名
- `limit` (optional): 返回数量
- `offset` (optional): 偏移量

### POST /api/v1/commits

创建新 Commit。

**请求体:**
```json
{
  "project_id": "proj_abc123",
  "branch": "main",
  "message": "Add initial planning",
  "parent_hashes": ["sha256:..."],
  "turn_window": {
    "start_turn_hash": "sha256:...",
    "end_turn_hash": "sha256:..."
  },
  "facet_snapshot": [
    { "type": "goal", "text": "Visit Japan" }
  ],
  "source_refs": [
    { "type": "conversation", "conversation_id": "conv_xyz789" }
  ]
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "commit_hash": "sha256:def456...",
    "project_id": "proj_abc123",
    "branch": "main",
    "message": "Add initial planning",
    "created_at": "2025-12-23T10:00:00Z"
  }
}
```

### GET /api/v1/commits/{commit_hash}

获取单个 Commit。

---

## 8. Draft API

### GET /api/v1/drafts

列出 Draft。

**查询参数:**
- `project_id` (required): 项目 ID

### POST /api/v1/drafts

创建新 Draft。

**请求体:**
```json
{
  "project_id": "proj_abc123",
  "conversation_id": "conv_xyz789",
  "bridge_id": "summary",
  "bridge_payload": {},
  "llm_config": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet"
  },
  "text": "Draft content here..."
}
```

### GET /api/v1/drafts/{draft_id}

获取单个 Draft。

### PUT /api/v1/drafts/{draft_id}

更新 Draft。

### DELETE /api/v1/drafts/{draft_id}

删除 Draft。

---

## 9. Diff API

### POST /api/v1/diff/two-way

执行两路 Diff。

**请求体:**
```json
{
  "base_commit_hash": "sha256:...",
  "target_commit_hash": "sha256:..."
}
```

### POST /api/v1/diff/three-way

执行三路 Diff。

**请求体:**
```json
{
  "base_commit_hash": "sha256:...",
  "source_commit_hash": "sha256:...",
  "target_commit_hash": "sha256:..."
}
```

---

## 10. Merge API

### POST /api/v1/merge

执行三路合并。

**请求体:**
```json
{
  "project_id": "proj_abc123",
  "base_commit_hash": "sha256:...",
  "source_commit_hash": "sha256:...",
  "target_commit_hash": "sha256:..."
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "merge_result_id": "merge_abc123",
    "status": "clean",
    "auto_merged": [...],
    "conflicts": [],
    "conflict_count": 0
  }
}
```

### POST /api/v1/merge/resolve

解决合并冲突。

**请求体:**
```json
{
  "merge_result_id": "merge_abc123",
  "resolutions": [
    {
      "conflict_index": 0,
      "resolution": "source"
    }
  ]
}
```

---

## 11. 导出 API

### GET /api/v1/export/cfpack

导出项目为 .cfpack 格式。

**查询参数:**
- `project_id` (required): 项目 ID

**响应:**
```json
{
  "success": true,
  "data": {
    "t3x_version": "1.0",
    "metadata": {
      "created": "2025-12-23T10:00:00Z",
      "project_id": "proj_abc123",
      "project_name": "My Project"
    },
    "turns": [...],
    "commits": [...],
    "branches": [...]
  }
}
```

### GET /api/v1/export/ledger

导出项目的完整 Ledger（含所有历史）。

---

## 12. Agent Draft API

### POST /api/v1/agent/drafts

创建 Agent 生成的 Draft（需要 LLM）。

**请求体:**
```json
{
  "project_id": "proj_abc123",
  "conversation_id": "conv_xyz789",
  "bridge_id": "summary",
  "intent": "Summarize the trip planning discussion"
}
```

### GET /api/v1/agent/drafts/{draft_id}

获取 Agent Draft 状态。

---

## 13. 聊天 API

### GET /api/v1/chat/providers

列出可用的 LLM 提供者。

### POST /api/v1/chat

发送聊天消息。

### POST /api/v1/chat/stream

流式聊天（SSE）。

---

_文档版本: 2.0_
_最后更新: 2025-12-23_
