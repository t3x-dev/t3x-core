# T3X API & Function Reference

A comprehensive dictionary of all APIs, functions, and their locations for project owners.

**Last Updated:** 2026-01-23

---

## Table of Contents

1. [API Endpoints (Hono API)](#1-api-endpoints-hono-api)
2. [Storage Layer (@t3x/storage)](#2-storage-layer-t3xstorage)
3. [Core Layer (@t3x/core)](#3-core-layer-t3xcore)
4. [Provider Layer (lib/providers)](#4-provider-layer-libproviders)
5. [React Hooks](#5-react-hooks)
6. [State Stores](#6-state-stores)

---

## 1. API Endpoints (Hono API)

The API is a standalone Hono server running independently from the Next.js WebUI.

**Server:** `apps/api/` (Hono + @hono/zod-openapi)
**Base URL:** `http://localhost:8000/api`
**OpenAPI Spec:** `GET /api/openapi.json`
**API Docs (Scalar):** `GET /api/docs`
**Health Check:** `GET /health` (at root, not under `/api`)

### Projects

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/v1/projects` | List all projects | `projects.openapi.ts` |
| POST | `/v1/projects` | Create a project | `projects.openapi.ts` |
| GET | `/v1/projects/:id` | Get project by ID with stats | `projects.openapi.ts` |
| PUT | `/v1/projects/:id` | Update project | `projects.openapi.ts` |
| DELETE | `/v1/projects/:id` | Delete project | `projects.openapi.ts` |

### Conversations

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/v1/conversations` | List conversations | `conversations.ts` |
| POST | `/v1/conversations` | Create conversation | `conversations.ts` |
| GET | `/v1/conversations/:id` | Get conversation | `conversations.ts` |
| PUT | `/v1/conversations/:id` | Update conversation | `conversations.ts` |
| DELETE | `/v1/conversations/:id` | Delete conversation | `conversations.ts` |

### Turns

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/v1/turns` | List turns | `turns.ts` |
| POST | `/v1/turns` | Create turn (auto-extracts rings) | `turns.ts` |
| GET | `/v1/turns/:hash` | Get turn by hash | `turns.ts` |
| GET | `/v1/turns/:hash/chain` | Get turn chain | `turns.ts` |

**Ring Extraction:** When creating a turn via `POST /v1/turns`, the API automatically extracts Ring 1/2/3 semantic data:
- **Requires `GOOGLE_CLOUD_NLP_KEY`**: Uses Google Cloud NLP for POS tagging, NER, and dependency parsing (Ring 1/2)
- **Ring 3 分句**: 使用规则分句器 (`splitSentencesRuleBased`)，不依赖 Google NLP 分句
- **Proxy support**: Set `HTTPS_PROXY`/`HTTP_PROXY` for networks requiring proxy (e.g., China)

The extracted rings populate `rings_json` with keywords, entities, facets, and segments. These are collected by `POST /v1/commits` into `facet_snapshot`.

### Commits

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/v1/commits` | List commits | `commits.ts` |
| POST | `/v1/commits` | Create commit | `commits.ts` |
| GET | `/v1/commits/:hash` | Get commit by hash | `commits.ts` |

### CommitV3 (NEW)

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/v1/commits-v3` | List CommitV3 commits | `commits-v3.openapi.ts` |
| POST | `/v1/commits-v3` | Create CommitV3 commit | `commits-v3.openapi.ts` |
| GET | `/v1/commits-v3/:hash` | Get CommitV3 by hash | `commits-v3.openapi.ts` |
| PUT | `/v1/commits-v3/:hash` | Update CommitV3 (message, position) | `commits-v3.openapi.ts` |
| DELETE | `/v1/commits-v3/:hash` | Delete CommitV3 | `commits-v3.openapi.ts` |

**CommitV3 数据模型**：
```json
{
  "commit_hash": "sha256:...",
  "schema": "t3x/commit/v3",
  "parents": ["sha256:..."],
  "author": { "type": "human|agent", "id": "user_123", "name": "Alice" },
  "committed_at": "ISO8601",
  "content": {
    "sentences": [{ "id": "s1", "text": "We want to visit Tokyo." }],
    "constraints": [{ "type": "require", "value": "spring", "sentence_id": "s1" }]
  },
  "project_id": "proj_...",
  "message": "Initial plan",
  "branch": "main"
}
```

**字段分类**：
- **First-class（参与 hash）**: `schema`, `parents`, `author`, `committed_at`, `content`
- **Second-class（不参与 hash）**: `project_id`, `message`, `branch`, `position_x`, `position_y`

### Branches

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/v1/branches` | List branches | `branches.ts` |
| POST | `/v1/branches` | Create branch | `branches.ts` |
| GET | `/v1/branches/current` | Get current branch | `branches.ts` |
| POST | `/v1/branches/switch` | Switch branch | `branches.ts` |

### Drafts

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/v1/drafts` | List drafts | `drafts.ts` |
| POST | `/v1/drafts` | Create draft | `drafts.ts` |
| GET | `/v1/drafts/:id` | Get draft | `drafts.ts` |
| DELETE | `/v1/drafts/:id` | Delete draft | `drafts.ts` |

### Agent Drafts (LLM-powered)

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| POST | `/v1/agent/drafts` | Create draft with LLM | `agent-drafts.ts` |
| GET | `/v1/agent/drafts/:id` | Get agent draft | `agent-drafts.ts` |
| PATCH | `/v1/agent/drafts/:id` | Regenerate with feedback | `agent-drafts.ts` |

**Bridge Templates** (用于 `bridge_id` 参数):
| Bridge ID | 用途 |
|-----------|------|
| `prose` | 重写为连贯的段落文字 |
| `plan` | 创建结构化计划 |
| `story` | 提取为叙事故事 |
| `summary` | 生成摘要 |
| `refine` | 标记需要改进的句子 |
| `explain` | 生成解释说明 |
| `clarify` | 生成澄清问题 |

### Curate (Semantic Selection)

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| POST | `/v1/curate/preview` | Preview curated chunks by cosine similarity | `curate.ts` |

**Curate Preview**: 基于语义相似度选择文本块。使用 Google AI Embeddings 计算 intent 与 Ring3 segments 的余弦相似度，返回选中的 chunks 和 spans。

- **Requires `GOOGLE_AI_STUDIO_KEY`**: 用于 embedding 计算
- **复用 Ring3 segments**: 分块使用已存储的 Ring3 句子分割（规则分句器生成）
- **v1.1 Anchor Candidates**: 返回 `anchor_candidates` 数组（含 chunk-relative 位置），用于 UI 高亮

### Diff

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| POST | `/v1/diff/two-way` | Two-way semantic diff | `diff.ts` |
| POST | `/v1/diff/three-way` | Three-way semantic diff | `diff.ts` |

### Merge

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| POST | `/v1/merge` | Three-way merge | `merge.ts` |
| POST | `/v1/merge/resolve` | Resolve conflicts | `merge.ts` |
| POST | `/v1/merge/prepare` | Prepare two-way merge (NEW) | `merge.openapi.ts` |
| POST | `/v1/merge/execute` | Execute two-way merge (NEW) | `merge.openapi.ts` |

**两路合并工作流** (用于 CommitV3)：
1. `POST /v1/merge/prepare` - 分析 source 和 target commit 的句子相似度
   - 返回 `similar_pairs[]`: 相似句对列表，含词级 diff
   - 返回 `source_only[]`: 仅在 source 中的句子
   - 返回 `target_only[]`: 仅在 target 中的句子
2. 用户决定每个相似句对保留 source 还是 target
3. `POST /v1/merge/execute` - 执行合并决策，生成新 commit

**Prepare 响应结构**：
```json
{
  "similar_pairs": [
    {
      "source": { "id": "s1", "text": "Visit Tokyo in spring." },
      "target": { "id": "t1", "text": "Visit Tokyo in autumn." },
      "similarity": 0.85,
      "word_diff": [
        { "type": "equal", "text": "Visit Tokyo in " },
        { "type": "delete", "text": "spring" },
        { "type": "insert", "text": "autumn" },
        { "type": "equal", "text": "." }
      ]
    }
  ],
  "source_only": [...],
  "target_only": [...]
}
```

### Merge Drafts (NEW)

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| POST | `/v1/merge/drafts` | Create a new merge draft | `merge.openapi.ts` |
| GET | `/v1/merge/drafts/:id` | Get merge draft by ID | `merge.openapi.ts` |
| PATCH | `/v1/merge/drafts/:id` | Update merge draft decisions | `merge.openapi.ts` |
| POST | `/v1/merge/drafts/:id/commit` | Commit a merge draft | `merge.openapi.ts` |
| DELETE | `/v1/merge/drafts/:id` | Delete a merge draft | `merge.openapi.ts` |

**Merge Draft 工作流**：
1. `POST /v1/merge/prepare` - 分析两个 commit 的句子相似度
2. `POST /v1/merge/drafts` - 创建 merge draft 保存分析结果
3. `PATCH /v1/merge/drafts/:id` - 用户逐步做出决策（选择 source 或 target）
4. `POST /v1/merge/drafts/:id/commit` - 确认决策，生成新 commit

**Merge Draft 状态**：
- `pending`: 正在编辑中
- `committed`: 已提交为新 commit
- `cancelled`: 已取消

### Chat

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| POST | `/v1/chat` | Chat completion | `chat.ts` |
| POST | `/v1/chat/stream` | Streaming chat (SSE) | `chat.ts` |
| GET | `/v1/chat/providers` | List providers | `chat.ts` |

**Proxy Support:** Chat routes use `undici` for HTTP requests, supporting `HTTPS_PROXY` / `HTTP_PROXY` environment variables.

### Export

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/v1/export/cfpack` | Export as .cfpack | `export.ts` |
| GET | `/v1/export/ledger` | Export as JSONL | `export.ts` |

### Status

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/v1/status` | System status | `status.ts` |

### Runner

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| POST | `/v1/runner/agents` | Register an agent | `runner.ts` |
| GET | `/v1/runner/agents/:id` | Get agent config | `runner.ts` |
| POST | `/v1/runner/run` | Execute an agent run | `runner.ts` |
| POST | `/v1/runner/run/:id/event` | Add event to run trace | `runner.ts` |
| GET | `/v1/runner/run/:id` | Get run trace | `runner.ts` |
| GET | `/v1/runner/runs` | List runs | `runner.ts` |
| POST | `/v1/runner/eval` | Evaluate a run/trace | `runner.ts` |
| POST | `/v1/runner/eval/validate` | Validate test steps | `runner.ts` |
| POST | `/v1/runner/webhook/run` | Webhook trigger for agent run | `runner.ts` |
| GET | `/v1/runner/suites` | List eval suites | `runner.ts` |
| GET | `/v1/runner/suites/:id` | Get suite details | `runner.ts` |
| POST | `/v1/runner/suites/:id/run` | Run a suite | `runner.ts` |

### Deploy Agents

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/v1/deploy-agents` | List deployed agents | `deploy-agents.ts` |
| POST | `/v1/deploy-agents` | Deploy an agent | `deploy-agents.ts` |
| GET | `/v1/deploy-agents/:id` | Get agent by ID | `deploy-agents.ts` |
| PUT | `/v1/deploy-agents/:id` | Update agent | `deploy-agents.ts` |
| DELETE | `/v1/deploy-agents/:id` | Delete agent | `deploy-agents.ts` |

### Runs

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/v1/runs` | List runs (supports A/B test filters) | `runs.ts` |
| POST | `/v1/runs` | Create and trigger a run | `runs.ts` |
| GET | `/v1/runs/:id` | Get run by ID | `runs.ts` |
| GET | `/v1/runs/by-runner-id/:runnerRunId` | Get run by runner_run_id | `runs.ts` |
| POST | `/v1/runs/ingest` | Receive results from Runner (callback) | `runs.ts` |
| GET | `/v1/runs/filters` | Get filter options (models, versions) | `runs.ts` |
| GET | `/v1/runs/configurations` | Get aggregated stats by configuration | `runs.ts` |
| POST | `/v1/runs/compare` | Compare two configurations (A/B test) | `runs.ts` |

**A/B Test 功能** (v2.1+)：
- `metadata` 字段支持存储 `model`, `prompt_version`, `test_case` 用于 A/B 测试分组
- `GET /v1/runs?model=X&prompt_version=Y` 按配置筛选 runs
- `GET /v1/runs/configurations` 返回按配置聚合的统计（run_count, pass_rate, avg_score 等）
- `POST /v1/runs/compare` 对两个配置进行统计显著性检验（Z-test for pass_rate, t-test for avg_score）

**Trace 存储** (v2.0+)：
- `trace_summary_json`: 轻量级统计（总是存储）
- `full_trace_json`: 完整运行记录（条件存储，由 `trace_policy` 控制）

### CommitsV4 (V4 NEW)

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| POST | `/v1/commits-v4` | Create a new CommitV4 | `commits-v4.openapi.ts` |
| GET | `/v1/commits-v4/:hash` | Get CommitV4 by hash | `commits-v4.openapi.ts` |
| GET | `/v1/projects/:projectId/commits-v4` | List CommitV4 by project | `commits-v4.openapi.ts` |
| PATCH | `/v1/commits-v4/:hash/position` | Update canvas position | `commits-v4.openapi.ts` |
| DELETE | `/v1/commits-v4/:hash` | Delete CommitV4 | `commits-v4.openapi.ts` |

**CommitV4 数据模型**：
```json
{
  "hash": "sha256:...",
  "schema": "t3x/commit/v4",
  "parents": ["sha256:..."],
  "author": { "type": "human", "id": "user_123", "name": "Alice" },
  "committed_at": "ISO8601",
  "content": {
    "sentences": [
      { "id": "s_abc123", "text": "We want to visit Tokyo in spring." }
    ]
  },
  "project_id": "proj_...",
  "message": "Initial plan",
  "branch": "main",
  "source_refs": [
    { "type": "conversation", "id": "conv_...", "title": "Trip Planning" }
  ],
  "position_x": 100,
  "position_y": 200
}
```

**CommitV4 vs CommitV3**：
- CommitV4 的 `content` **只包含 `sentences`**，不包含 constraints
- Constraints 移至 Leaf（应用层）
- 同一 CommitV4 可被多个 Leaf 引用，使用不同的 constraints
- `author.type` 为 `'human' | 'agent'`

**Branch HEAD 自动更新**：创建 CommitV4 时，若指定 `branch` 和 `project_id`，会自动更新对应分支的 HEAD。

### Leaves (V4 NEW)

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| POST | `/v1/leaves` | Create a new leaf | `leaves.openapi.ts` |
| GET | `/v1/leaves/:id` | Get leaf by ID | `leaves.openapi.ts` |
| PATCH | `/v1/leaves/:id` | Update leaf (constraints, config) | `leaves.openapi.ts` |
| DELETE | `/v1/leaves/:id` | Delete leaf | `leaves.openapi.ts` |
| GET | `/v1/commits/:hash/leaves` | List leaves by commit | `leaves.openapi.ts` |
| GET | `/v1/projects/:projectId/leaves` | List leaves by project | `leaves.openapi.ts` |

**Leaf 数据模型** (V4 架构)：
```json
{
  "id": "leaf_abc123",
  "commit_hash": "sha256:...",
  "project_id": "proj_...",
  "type": "deploy_agent",
  "title": "My Agent",
  "constraints": [
    { "id": "cst_xxx", "type": "require", "match_mode": "semantic", "value": "cherry blossom", "source_sentence_id": "s_abc" },
    { "id": "cst_yyy", "type": "exclude", "match_mode": "exact", "value": "competitor", "reason": "Policy restriction" }
  ],
  "config": { "model": "claude-sonnet-4", "temperature": 0.7 },
  "output": "Generated content here...",
  "generated_at": "ISO8601",
  "assertions": [
    { "id": "ast_zzz", "constraint_id": "cst_xxx", "passed": true, "details": "Found 'cherry blossom' in output" }
  ],
  "created_at": "ISO8601"
}
```

**Leaf Types**：
- `deploy_agent` - 部署 Agent 系统提示
- `tweet` / `weibo` / `wechat` - 社交媒体发布
- `email` / `article` / `slack` - 其他输出渠道
- `eval` - 评估/测试用途

### Pins (V4 NEW)

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| POST | `/v1/projects/:projectId/pins` | Create a new pin | `pins.openapi.ts` |
| GET | `/v1/projects/:projectId/pins` | List pins by project | `pins.openapi.ts` |
| GET | `/v1/pins/:id` | Get pin by ID | `pins.openapi.ts` |
| PATCH | `/v1/pins/:id/assertions` | Update selected assertions | `pins.openapi.ts` |
| DELETE | `/v1/pins/:id` | Delete pin | `pins.openapi.ts` |

**Pin 数据模型**：
```json
{
  "id": "pin_abc123",
  "project_id": "proj_...",
  "type": "conversation",
  "ref_id": "conv_...",
  "selected_assertion_ids": null,
  "pinned_at": "ISO8601",
  "pinned_by": "user_123"
}
```

**Pin 用途**：
- `type: 'conversation'` - 将对话作为 commit 来源或上下文
- `type: 'leaf'` - 将 leaf 的 assertion lessons 作为上下文
- `selected_assertion_ids`: 指定包含哪些 assertions，`null` 表示全部

**重复 Pin 处理**：对同一 `(project_id, type, ref_id)` 组合创建 pin 会返回 `409 DUPLICATE_PIN`。

**V4 架构核心概念**：
- **CommitV4**: 纯知识存储（sentences only, NO constraints）
- **Leaf**: 应用层，拥有 constraints、output、assertions
- **Pin**: 源选择机制，用于 commit 来源 + 对话上下文
- 多个 Leaf 可引用同一 Commit，使用不同的 constraints

### API Internal Libraries (apps/api/src/lib/)

| File | Export | Description |
|------|--------|-------------|
| `db.ts` | `getDB()` | Get database instance (PostgreSQL or PGLite) |
| `db.ts` | `closeDB()` | Close database connection (graceful shutdown) |
| `nlp.ts` | `getNLPProvider()` | Get singleton NLP provider (requires Google Cloud NLP) |
| `nlp.ts` | `getProxyFetch()` | Get proxy-aware fetch for API calls |
| `response.ts` | `jsonSuccess()` | Format success response |
| `response.ts` | `jsonError()` | Format error response |

**Database Mode:**
- If `DATABASE_URL` is set: Uses PostgreSQL (Docker/production)
- Otherwise: Uses PGLite with file storage (local development)
- Set `T3X_IN_MEMORY=true` for PGLite in-memory mode

**NLP Provider (`getNLPProvider()`):**
- Requires `GOOGLE_CLOUD_NLP_KEY`: Uses `GoogleCloudNLPProvider` from `@t3x/core`
- Supports HTTP proxy via `HTTPS_PROXY`/`HTTP_PROXY` environment variables

**GoogleCloudNLPProvider Features (Production):**
- High-quality tokenization and lemmatization
- Accurate POS tagging with full morphology
- Named Entity Recognition (LOCATION, PERSON, ORGANIZATION, etc.)
- Dependency parsing with head indices
- Document-level sentiment analysis

---

## 2. Storage Layer (@t3x/storage)

**Location:** `packages/storage/src/queries/`
**Import:** `import { ... } from '@t3x/storage'`

### Projects (`projects.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `insertProject` | `(db, input: CreateProjectInput)` | Create a new project |
| `findProjectById` | `(db, projectId: string)` | Get project by ID |
| `findProjects` | `(db, options: ListProjectsOptions)` | List projects with pagination |
| `findProjectWithStats` | `(db, projectId: string)` | Get project with statistics |
| `updateProject` | `(db, projectId, input)` | Update project fields |
| `deleteProject` | `(db, projectId: string)` | Delete project |

**Types:**
- `CreateProjectInput` - `{ name, description?, metadata? }`
- `ListProjectsOptions` - `{ limit?, offset?, orderBy? }`
- `ProjectStats` - `{ conversationCount, turnCount, commitCount }`
- `ProjectWithStats` - `Project & { stats: ProjectStats }`

### Conversations (`conversations.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `insertConversation` | `(db, input: CreateConversationInput)` | Create conversation |
| `findConversationById` | `(db, conversationId: string)` | Get by ID |
| `findConversationsByProject` | `(db, { projectId, limit?, offset? })` | List by project |
| `updateConversation` | `(db, conversationId, input)` | Update conversation |
| `deleteConversation` | `(db, conversationId: string)` | Delete conversation |
| `getConversationTurnCount` | `(db, conversationId: string)` | Count turns |

**Types:**
- `CreateConversationInput` - `{ projectId, title?, metadata? }`
- `ListConversationsOptions` - `{ projectId, limit?, offset? }`
- `UpdateConversationInput` - `{ title?, metadata? }`

### Turns (`turns.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `insertTurn` | `(db, input: CreateTurnInput)` | Create turn (auto-hashes) |
| `findTurnByHash` | `(db, turnHash: string)` | Get by hash |
| `findTurnsByConversation` | `(db, { conversationId, limit?, order? })` | List by conversation |
| `findTurnsByProject` | `(db, { projectId, limit?, offset? })` | List by project |
| `findLastTurnInConversation` | `(db, conversationId: string)` | Get last turn |
| `findTurnChain` | `(db, turnHash: string)` | Get ancestor chain |
| `findTurnsInWindow` | `(db, startHash, endHash)` | Get turns in range |

**Types:**
- `CreateTurnInput` - `{ projectId, conversationId, role, content, language?, rings? }`
- `ListTurnsOptions` - `{ conversationId, limit?, offset?, order? }`
- `ListTurnsByProjectOptions` - `{ projectId, limit?, offset? }`

### Commits (`commits.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `insertCommit` | `(db, input: CreateCommitInput)` | Create commit |
| `findCommitByHash` | `(db, commitHash: string)` | Get by hash |
| `findCommitsByProject` | `(db, { projectId, branch?, limit? })` | List by project |
| `findCommitParents` | `(db, commitHash: string)` | Get parent commits |
| `findCommitHistory` | `(db, commitHash, limit?)` | Get commit history |
| `updateCommitPosition` | `(db, commitHash, position)` | Update DAG position |
| `findCommonAncestor` | `(db, hash1, hash2)` | Find merge base |

**Types:**
- `CreateCommitInput` - `{ projectId, branch, message, parentHashes, turnWindow, anchors?, ... }`
  - `anchors` (v1.1): Confirmed anchors with constraints for auditing
- `ListCommitsOptions` - `{ projectId, branch?, limit?, offset? }`
- `TurnWindow` - `{ startTurnHash, endTurnHash }`

### CommitsV3 (`commitsV3.ts`) - NEW

| Function | Signature | Description |
|----------|-----------|-------------|
| `insertCommitV3` | `(db, input: CreateCommitV3Input)` | Create CommitV3 commit |
| `findCommitV3ByHash` | `(db, commitHash: string)` | Get by hash |
| `findCommitsV3ByProject` | `(db, { projectId, branch?, limit? })` | List by project |
| `updateCommitV3` | `(db, commitHash, input)` | Update message/position |
| `deleteCommitV3` | `(db, commitHash: string)` | Delete commit |

**Types:**
- `CreateCommitV3Input` - `{ projectId, branch, author, content, parents?, message?, position? }`
  - `author`: `{ type: 'human' | 'agent', id: string, name?: string }`
  - `content`: `{ sentences: Sentence[], constraints?: Constraint[] }`
- `UpdateCommitV3Input` - `{ message?, positionX?, positionY? }`
- `CommitV3Record` - Full database record with all fields

**Hash 计算规则**：
- First-class fields 参与 hash: `schema`, `parents`, `author`, `committed_at`, `content`
- Second-class fields 不参与 hash: `project_id`, `message`, `branch`, `position_x`, `position_y`

### Branches (`branches.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `insertBranch` | `(db, input: CreateBranchInput)` | Create branch |
| `findBranchByName` | `(db, projectId, name)` | Get by name |
| `findBranchById` | `(db, branchId: string)` | Get by ID |
| `findBranchesByProject` | `(db, { projectId, limit? })` | List by project |
| `findCurrentBranch` | `(db, projectId: string)` | Get active branch |
| `switchBranch` | `(db, projectId, branchName)` | Switch active branch |
| `updateBranchHead` | `(db, branchId, headHash)` | Update HEAD |
| `deleteBranch` | `(db, branchId: string)` | Delete branch |
| `ensureMainBranch` | `(db, projectId: string)` | Create main if missing |

**Types:**
- `CreateBranchInput` - `{ projectId, name, headCommitHash? }`
- `ListBranchesOptions` - `{ projectId, limit?, offset? }`

### Drafts (`drafts.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `insertDraft` | `(db, input: CreateDraftInput)` | Create draft |
| `findDraftById` | `(db, draftId: string)` | Get by ID |
| `findDraftsByProject` | `(db, { projectId, status?, limit? })` | List by project |
| `updateDraft` | `(db, draftId, input)` | Update draft content |
| `updateDraftStatus` | `(db, draftId, status)` | Change status |
| `adoptDraft` | `(db, draftId: string)` | Mark as adopted |
| `supersedeDraft` | `(db, draftId: string)` | Mark as superseded |
| `getDraftTextHash` | `(db, draftId: string)` | Get content hash |
| `deleteDraft` | `(db, draftId: string)` | Delete draft |

**Types:**
- `CreateDraftInput` - `{ projectId, conversationId, bridgeId, bridgePayload, text, ... }`
- `ListDraftsOptions` - `{ projectId, status?, limit?, offset? }`
- `UpdateDraftInput` - `{ text?, mustHave?, bridgePayload?, completedAt? }`
- `DraftStatus` - `'ephemeral' | 'adopted' | 'superseded'`

### Merge Drafts (`merge-drafts.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `createMergeDraft` | `(db, input: CreateMergeDraftInput)` | Create a new merge draft |
| `getMergeDraft` | `(db, draftId: string)` | Get merge draft by ID |
| `listMergeDraftsByProject` | `(db, options: ListMergeDraftsOptions)` | List drafts by project |
| `updateMergeDraft` | `(db, draftId, input: UpdateMergeDraftInput)` | Update draft decisions/status |
| `commitMergeDraft` | `(db, draftId: string)` | Mark draft as committed |
| `cancelMergeDraft` | `(db, draftId: string)` | Mark draft as cancelled |
| `deleteMergeDraft` | `(db, draftId: string)` | Delete draft |
| `findPendingMergeDraft` | `(db, projectId, sourceHash, targetHash)` | Find pending draft for commits |

**Types:**
- `CreateMergeDraftInput` - `{ projectId, sourceHash, targetHash, sourceBranch?, targetBranch?, prepared, message? }`
- `ListMergeDraftsOptions` - `{ projectId, status?, limit?, offset? }`
- `UpdateMergeDraftInput` - `{ prepared?, message?, status? }`
- `MergeDraftStatus` - `'pending' | 'committed' | 'cancelled'`

### Segment Embeddings (`segmentEmbeddings.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `generateSegmentId` | `(turnHash, segmentIndex)` | Generate segment ID |
| `float32ArrayToBuffer` | `(arr: number[])` | Convert to buffer |
| `bufferToFloat32Array` | `(buf: Buffer)` | Convert from buffer |
| `insertSegmentEmbedding` | `(db, input)` | Store embedding |
| `insertSegmentEmbeddingsBatch` | `(db, input)` | Batch store |
| `findSegmentEmbeddingById` | `(db, segmentId)` | Get by ID |
| `findSegmentEmbeddingsByTurn` | `(db, turnHash)` | Get by turn |
| `findSegmentEmbeddingsByTurns` | `(db, turnHashes[])` | Get by multiple turns |
| `hasEmbeddingsForTurn` | `(db, turnHash)` | Check if exists |
| `deleteSegmentEmbeddingsByTurn` | `(db, turnHash)` | Delete by turn |
| `getEmbeddingsCountForTurn` | `(db, turnHash)` | Count embeddings |
| `findEmbeddingsByModel` | `(db, model)` | Get by model name |

### CommitsV4 (`commits-v4.ts`) - V4 NEW

| Function | Signature | Description |
|----------|-----------|-------------|
| `createCommitV4` | `(db, input: CreateCommitV4Options)` | Create CommitV4 (pure knowledge) |
| `findCommitV4ByHash` | `(db, commitHash: string)` | Get by hash |
| `findCommitsV4ByProject` | `(db, options: ListCommitsV4Options)` | List by project |
| `findCommitsV4ByBranch` | `(db, projectId, branch)` | List by branch |
| `getCommitV4Parents` | `(db, commitHash: string)` | Get parent commits |
| `getCommitsV4ByHashes` | `(db, hashes: string[])` | Get multiple by hashes |
| `updateCommitV4Position` | `(db, commitHash, position)` | Update canvas position |
| `deleteCommitV4` | `(db, commitHash: string)` | Delete commit |
| `computeCommitV4Hash` | `(data)` | Compute hash from first-class fields |

**Types:**
- `CreateCommitV4Options` - `{ projectId, branch, author, content, parents?, message?, sourceRefs? }`
- `ListCommitsV4Options` - `{ projectId, branch?, limit?, offset? }`
- `ParentNotFoundErrorV4` - Error when parent commit not found (strictParents mode)

**CommitV4 vs CommitV3**：
- CommitV4 的 `content` 只包含 `sentences`，**不包含 constraints**
- Constraints 移至 Leaf（应用层）
- 多个 Leaf 可引用同一 CommitV4，使用不同的 constraints

### Leaves (`leaves.ts`) - V4 NEW

| Function | Signature | Description |
|----------|-----------|-------------|
| `createLeaf` | `(db, input)` | Create a new leaf |
| `findLeafById` | `(db, leafId: string)` | Get by ID |
| `findLeavesByCommit` | `(db, commitHash: string)` | List by commit |
| `findLeavesByProject` | `(db, options: ListLeavesOptions)` | List by project |
| `getLeavesByIds` | `(db, ids: string[])` | Get multiple by IDs |
| `updateLeaf` | `(db, leafId, input: UpdateLeafInput)` | Update constraints/config |
| `updateLeafOutput` | `(db, leafId, output)` | Update output only |
| `updateLeafAssertions` | `(db, leafId, assertions)` | Update assertions only |
| `deleteLeaf` | `(db, leafId: string)` | Delete leaf |

**Types:**
- `ListLeavesOptions` - `{ projectId?, commitHash?, limit?, offset? }`
- `UpdateLeafInput` - `{ constraints?, config?, name? }`

### Pins (`pins.ts`) - V4 NEW

| Function | Signature | Description |
|----------|-----------|-------------|
| `createPin` | `(db, input)` | Create a new pin |
| `findPinById` | `(db, pinId: string)` | Get by ID |
| `findPinByRef` | `(db, projectId, type, refId)` | Get by reference |
| `findPinsByProject` | `(db, options: ListPinsOptions)` | List by project |
| `findPinsByType` | `(db, projectId, type)` | List by type |
| `getPinsByIds` | `(db, ids: string[])` | Get multiple by IDs |
| `updatePinAssertions` | `(db, pinId, assertions)` | Update assertions |
| `deletePin` | `(db, pinId: string)` | Delete pin |
| `deletePinByRef` | `(db, projectId, type, refId)` | Delete by reference |

**Types:**
- `ListPinsOptions` - `{ projectId, type?, limit?, offset? }`

**Pin 用途**：
- `type: 'commit'` - 将 commit 作为知识来源
- `type: 'conversation'` - 将对话上下文作为来源

### Conversation Contexts (`conversation-contexts.ts`) - V4 NEW

| Function | Signature | Description |
|----------|-----------|-------------|
| `getConversationContext` | `(db, conversationId: string)` | Get context config |
| `setConversationContext` | `(db, conversationId, pinIds: string[] \| null)` | Set/upsert context |
| `deleteConversationContext` | `(db, conversationId: string)` | Delete context |

**语义**：
- `pinIds: null` = 使用所有项目 pins（默认行为）
- `pinIds: string[]` = 只使用指定的 pins

---

## 3. Core Layer (@t3x/core)

**Location:** `packages/core/src/`
**Import:** `import { ... } from '@t3x/core'`

### Diff Engine (`diff/`)

| Export | Type | Description |
|--------|------|-------------|
| `DiffEngine` | Class | Semantic diff engine |
| `createDiffEngine` | Factory | `(config?) => DiffEngine` |
| `calculateDiffStats` | Function | Compute diff statistics |
| `computeWordDiff` | Function | Compute word-level diff between two strings |
| `diffCommits` | Function | Diff two CommitV3 commits (NEW) |
| `hungarian` | Function | Hungarian algorithm for optimal matching (NEW) |
| `DiffType` | Enum | `added`, `removed`, `modified`, `unchanged` |
| `SegmentDiff` | Type | Single segment diff result |
| `DiffResult` | Type | Full diff output |
| `DiffStats` | Type | Statistics summary |
| `WordDiffSegment` | Type | Word-level diff segment (NEW) |
| `CommitDiff` | Type | CommitV3 diff result (NEW) |

**Usage:**
```typescript
const engine = createDiffEngine({ similarityThreshold: 0.8 });
const result = engine.computeTwoWay(baseSegments, targetSegments);
const threeWay = engine.computeThreeWay(base, ours, theirs);

// Word-level diff (NEW)
import { computeWordDiff } from '@t3x/core';
const wordDiff = computeWordDiff("Visit Tokyo in spring.", "Visit Tokyo in autumn.");
// => [{ type: "equal", text: "Visit Tokyo in " }, { type: "delete", text: "spring" }, ...]
```

### Merge Engine (`merge/`)

| Export | Type | Description |
|--------|------|-------------|
| `MergeEngine` | Class | Three-way merge engine |
| `createMergeEngine` | Factory | `(options?) => MergeEngine` |
| `prepareMerge` | Function | Prepare two-way merge analysis (NEW) |
| `executeMerge` | Function | Execute merge with user decisions (NEW) |
| `ConflictType` | Enum | `content`, `structure`, `semantic` |
| `MergeConflict` | Type | Conflict details |
| `MergeResult` | Type | Full merge output |
| `MergeStats` | Type | Statistics summary |
| `Merge2WayResult` | Type | Two-way merge analysis result (NEW) |
| `MergeSimilarPair` | Type | Similar sentence pair with word diff (NEW) |
| `MergeDecision` | Type | User decision for a pair (NEW) |

**Usage:**
```typescript
// Three-way merge
const engine = createMergeEngine({ autoResolve: true });
const result = engine.merge(baseFacets, oursFacets, theirsFacets);
const resolved = engine.resolveConflicts(result, resolutions);

// Two-way merge (NEW)
import { prepareMerge, executeMerge } from '@t3x/core';
const analysis = prepareMerge(sourceCommit.content, targetCommit.content);
// User reviews similar_pairs and makes decisions
const merged = executeMerge(analysis, decisions);
```

### Ring Extractors (`extractors/`)

| Export | Type | Description |
|--------|------|-------------|
| `RingExtractor` | Class | Semantic extraction |
| `createRingExtractor` | Factory | `(config?) => RingExtractor` |
| `PolarityRuleEngine` | Class | Polarity detection |
| `createPolarityRuleEngine` | Factory | `() => PolarityRuleEngine` |
| `Ring1Output` | Type | Keywords, entities, temporal, anchor candidates (v1.1) |
| `Ring2Output` | Type | Intent, relations, facets |
| `Ring3Output` | Type | Sentence segments |
| `RingOutput` | Type | Combined ring output |
| `AnchorCandidate` | Type | v1.1: Anchor with position info for UI highlighting |
| `AnchorType` | Type | v1.1: `number`, `money`, `duration`, `percent`, `date`, `entity`, `term` |
| `AnchorSource` | Type | v1.1: `token`, `entity`, `phrase` |
| `createEmptyRing1/2/3` | Functions | Create empty ring objects |

**Usage:**
```typescript
const extractor = createRingExtractor({ nlpProvider });
const rings = await extractor.extract(text);
```

### Provider Interfaces (`providers/`, `llm/`)

| Export | Type | Description |
|--------|------|-------------|
| `NLPProvider` | Interface | NLP analysis provider |
| `NLPProviderError` | Class | NLP error type |
| `GoogleCloudNLPProvider` | Class | Google Cloud NLP implementation |
| `createGoogleCloudNLPProvider` | Factory | `(apiKey, config?) => GoogleCloudNLPProvider` |
| `EmbeddingProvider` | Interface | Text embedding provider |
| `EmbeddingProviderError` | Class | Embedding error type |
| `GoogleAIEmbeddingProvider` | Class | Google AI embedding implementation |
| `createGoogleAIEmbeddingProvider` | Factory | `(apiKey, config?) => GoogleAIEmbeddingProvider` |
| `LLMProvider` | Interface | Language model provider |
| `LLMProviderError` | Class | LLM error type |
| `ClaudeProvider` | Class | Claude API implementation |
| `createClaudeProvider` | Factory | `(config) => ClaudeProvider` |
| `cosineSimilarity` | Function | `(vecA, vecB) => number` |

**GoogleCloudNLPProvider Usage:**
```typescript
import { createGoogleCloudNLPProvider } from '@t3x/core';
const nlp = createGoogleCloudNLPProvider(apiKey, {
  fetch: customFetch,  // Optional: for proxy support
  timeout: 30000
});
const analysis = await nlp.analyze(text);
```

### Utilities (`common/`)

| Export | Type | Description |
|--------|------|-------------|
| `canonText` | Function | Canonicalize text |
| `hashText` | Function | Hash text content |
| `sha256` | Function | SHA-256 hash |
| `computeTurnHash` | Function | Generate turn hash |
| `computeTextHash` | Function | Generate content hash |
| `generateProjectId` | Function | Generate project ID |
| `generateDraftId` | Function | Generate draft ID |

---

## 4. Provider Layer (lib/providers)

**Location:** `apps/web/src/lib/providers/`
**Import:** `import { ... } from '@/lib/providers'`

### Claude Provider (`claude.provider.ts`)

| Export | Type | Description |
|--------|------|-------------|
| `ClaudeProvider` | Class | Claude API wrapper |
| `createClaudeProvider` | Factory | `(config) => ClaudeProvider` |
| `ClaudeProviderConfig` | Type | `{ apiKey, model?, baseUrl? }` |

**Usage:**
```typescript
const provider = createClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-5-20250929',
});
const response = await provider.generate(prompt, { temperature: 0.7 });
```

### Embedding Providers (`embedding.provider.ts`)

| Export | Type | Description |
|--------|------|-------------|
| `GoogleAIEmbeddingProvider` | Class | Google AI embeddings |
| `createGoogleAIEmbeddingProvider` | Factory | `(config) => GoogleAIEmbeddingProvider` |
| `CachedEmbeddingProvider` | Class | Caching wrapper |
| `createCachedEmbeddingProvider` | Factory | `(inner, db) => CachedEmbeddingProvider` |

**Usage:**
```typescript
const googleProvider = createGoogleAIEmbeddingProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});
const cached = createCachedEmbeddingProvider(googleProvider, db);
const embeddings = await cached.embedBatch(texts);
```

---

## 5. React Hooks

**Location:** `apps/web/src/hooks/`

| Hook | File | Description |
|------|------|-------------|
| `useApi` | `useApi.ts` | API client with error handling |

**Usage:**
```typescript
const { data, loading, error, refetch } = useApi('/api/v1/projects');
```

---

## 6. State Stores

**Location:** `apps/web/src/store/`
**Library:** Zustand

| Store | File | Description |
|-------|------|-------------|
| `useProjectStore` | `projectStore.ts` | Project state management |
| `useCanvasStore` | `canvasStore.ts` | Canvas/node state |
| `useAgentDemoStore` | `agentDemoStore.ts` | Agent demo state |
| `useMergeWorkspaceStore` | `mergeWorkspaceStore.ts` | Merge workspace state (NEW) |
| `useOptimiserStore` | `optimiserStore.ts` | Agent Optimiser state (NEW) |

**Usage:**
```typescript
const { projects, currentProject, setCurrentProject } = useProjectStore();
const { nodes, edges, addNode, updateNode } = useCanvasStore();
const { draftId, prepared, setDecision } = useMergeWorkspaceStore();
```

---

## Quick Lookup by Task

### "I want to..."

| Task | Function/Endpoint |
|------|-------------------|
| Create a project | `POST /v1/projects` → `insertProject()` |
| List all projects | `GET /v1/projects` → `findProjects()` |
| Add a conversation turn | `POST /v1/turns` → `insertTurn()` |
| Get conversation history | `GET /v1/turns?conversation_id=X` → `findTurnsByConversation()` |
| Compare two versions | `POST /v1/diff/two-way` → `DiffEngine.computeTwoWay()` |
| Two-way merge (NEW) | `POST /v1/merge/prepare` → `prepareMerge()` |
| Execute merge (NEW) | `POST /v1/merge/execute` → `executeMerge()` |
| Save merge draft (NEW) | `POST /v1/merge/drafts` → `createMergeDraft()` |
| Three-way merge | `POST /v1/merge` → `MergeEngine.merge()` |
| Compare A/B configs (NEW) | `POST /v1/runs/compare` → `twoProportionZTest()` |
| Generate with LLM | `POST /v1/agent/drafts` → `ClaudeProvider.generate()` |
| Export project | `GET /v1/export/cfpack` → (route handler) |
| Get embeddings | `CachedEmbeddingProvider.embedBatch()` |
| Create leaf (V4) | `POST /v1/leaves` → `createLeaf()` |
| Get leaves by commit (V4) | `GET /v1/commits/:hash/leaves` → `findLeavesByCommit()` |
| Create CommitV4 (V4) | `POST /v1/commits-v4` → `createCommitV4()` |
| Pin conversation/leaf (V4) | `POST /v1/projects/:id/pins` → `createPin()` |
| List pins (V4) | `GET /v1/projects/:id/pins` → `findPinsByProject()` |
| Set conversation context (V4) | `setConversationContext()` (Storage only) |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12-21 | Initial version |
| 2.0 | 2025-12-29 | Updated for Hono API migration; removed deprecated Next.js routes |
| 2.1 | 2025-12-29 | Added automatic ring extraction on turn creation; added lib/nlp.ts |
| 2.2 | 2025-12-29 | Added Runner, Deploy Agents, Runs routes; PostgreSQL dual mode; HTTP proxy support |
| 2.3 | 2026-01-09 | Added Ring 1 v1.1 anchor candidates types (AnchorCandidate, AnchorType, AnchorSource) |
| 2.4 | 2026-01-14 | Added CommitV3 API/Storage; Two-way merge prepare/execute; Word-level diff; Hungarian matching |
| 2.5 | 2026-01-19 | Replaced Merge Results with Merge Drafts; Added Runs A/B test endpoints (filters, configurations, compare); Added trace storage fields |
| 2.6 | 2026-01-22 | Added V4 architecture: Leaves API, CommitsV4/Leaves/Pins/ConversationContexts Storage functions |
| 2.7 | 2026-01-23 | Added CommitsV4 API, Pins API; Updated Leaf/Constraint/Assertion types to match code; Added ensureMainBranch for branch HEAD auto-update |
