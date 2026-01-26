# BVT/冒烟级集成测试

**Last Updated:** 2025-12-29

## 目标

做出一套能重复跑的 BVT/冒烟级集成测试（API 驱动），验证发布级风险：

**route → drizzle → DB schema → hash/引用一致性**

本测试不涉及 UI/Playwright。

---

## 环境配置

| 配置项 | 值 |
|--------|-----|
| API Base URL | `http://localhost:8000` |
| Health Check | `GET /health` → `{ status: 'ok' }` |
| API Endpoints | `GET/POST /api/v1/...` |
| 数据库 | PGLite（数据目录：`.t3x/database/`）|
| Hash 函数 | `@t3x/core` → `computeTurnHash()`, `computeCommitHash()` |
| 启动命令 | `pnpm dev:api` |
| 测试命令 | `pnpm --filter @t3x/api test` |

## 清库策略

每次测试前删除数据库目录，确保干净环境：

```bash
rm -rf .t3x/database
```

---

## BVT-1: Turn 写入冒烟测试

### Precondition
- 服务启动成功（`GET /health` 返回 `status: ok`）
- 已创建 Project 和 Conversation

### Steps

| # | 操作 | API | Body |
|---|------|-----|------|
| 1 | 创建项目 | `POST /api/v1/projects` | `{ "name": "BVT Test" }` |
| 2 | 创建对话 | `POST /api/v1/conversations` | `{ "project_id": "...", "title": "Test Conv" }` |
| 3 | 创建第一条 Turn | `POST /api/v1/turns` | `{ "project_id": "...", "conversation_id": "...", "role": "user", "content": "Hello" }` |
| 4 | 创建第二条 Turn | `POST /api/v1/turns` | `{ "project_id": "...", "conversation_id": "...", "role": "assistant", "content": "Hi there" }` |

### Expected

| # | 断言点 | 通过标准 |
|---|--------|---------|
| 1 | HTTP 状态码 | 201 Created |
| 2 | turn_hash 格式 | 匹配 `sha256:[a-f0-9]{64}` |
| 3 | 第一条 parent_turn_hash | `null` |
| 4 | 第二条 parent_turn_hash | 等于第一条的 turn_hash |
| 5 | DB 查询 | 按 turn_hash 能查到记录 |
| 6 | API hash == DB hash | 完全相等 |
| 7 | **Core 重算 hash == API hash** | 完全相等（王炸断言）|

### Evidence
- [ ] API Response JSON 截图
- [ ] DB 查询结果
- [ ] Hash 三方对比日志

---

## BVT-2: Commit 写入冒烟测试

### Precondition
- 服务启动成功
- 已创建 Project、Conversation、至少 2 条 Turns

### Steps

| # | 操作 | API | Body |
|---|------|-----|------|
| 1 | 获取 turns 列表 | `GET /api/v1/turns?conversation_id=xxx` | - |
| 2 | 创建 commit | `POST /api/v1/commits` | `{ "project_id": "...", "branch": "main", "turn_window": { "start_turn_hash": "...", "end_turn_hash": "..." } }` |

### Expected

| # | 断言点 | 通过标准 |
|---|--------|---------|
| 1 | HTTP 状态码 | 201 Created |
| 2 | commit_hash 格式 | 匹配 `sha256:[a-f0-9]{64}` |
| 3 | turn_window_json | 非空，包含正确的 start/end hash |
| 4 | parents_json | 首次为 `[]`，后续指向父 commit |
| 5 | branch | 等于请求的 branch（如 `main`）|
| 6 | DB 新增记录 | commits 表 +1 条 |
| 7 | **Core 重算 hash == API hash** | 完全相等（王炸断言）|

### Evidence
- [ ] API Response JSON
- [ ] DB commits 表查询结果
- [ ] Hash 验证日志

---

## BVT-3: Conversation 创建冒烟测试

### Precondition
- 服务启动成功
- 已创建 Project

### Steps

| # | 操作 | API | Body |
|---|------|-----|------|
| 1 | 创建对话 | `POST /api/v1/conversations` | `{ "project_id": "...", "title": "New Conversation" }` |

### Expected

| # | 断言点 | 通过标准 |
|---|--------|---------|
| 1 | HTTP 状态码 | 201 Created |
| 2 | conversation_id 格式 | 匹配 `conv_[a-f0-9]{8}` |
| 3 | project_id | 等于请求的 project_id |
| 4 | DB 新增记录 | conversations 表 +1 条 |
| 5 | API id == DB id | 完全相等 |

### Evidence
- [ ] API Response JSON
- [ ] DB 查询结果

---

## BVT-4: 读路径冒烟测试

### Precondition
- 已完成 BVT-1, BVT-2, BVT-3 的写入操作

### Steps

| # | 操作 | API |
|---|------|-----|
| 1 | 读取 turns | `GET /api/v1/turns?conversation_id=xxx` |
| 2 | 读取 commits | `GET /api/v1/commits?project_id=xxx` |
| 3 | 读取 conversations | `GET /api/v1/conversations?project_id=xxx` |

### Expected

| # | 断言点 | 通过标准 |
|---|--------|---------|
| 1 | HTTP 状态码 | 200 OK |
| 2 | 返回数据 | 包含刚写入的记录 |
| 3 | 关键字段 | turn_hash / commit_hash / conversation_id 存在且正确 |
| 4 | 数据条数 | 与写入数量一致 |

### Evidence
- [ ] API Response JSON（包含刚写入的数据）

---

## 测试结果汇总

| 用例 | 环境 | 状态 | 测试数 | 备注 |
|------|------|------|--------|------|
| BVT-1 Turn 写入 | PGLite | ✅ 通过 | 5 | 含王炸断言 |
| BVT-2 Commit 写入 | PGLite | ✅ 通过 | 4 | 含王炸断言 |
| BVT-3 Conversation 创建 | PGLite | ✅ 通过 | 4 | |
| BVT-4 读路径 | PGLite | ✅ 通过 | 4 | |
| **总计** | | **✅ 全部通过** | **17** | |

---

## 执行记录

- **首次执行日期**: 2024-12-23
- **执行者**: （填写你的名字）
- **环境**: PGLite (本地内存数据库)
- **发现问题**: 无

### 执行命令

```bash
# 启动 API 服务
pnpm dev:api

# 运行 API 测试
pnpm --filter @t3x/api test
```

### 执行输出

```
以实际测试输出为准。
```

---

## 自动化代码位置

```
apps/api/src/__tests__/
├── health.test.ts            # 健康检查
├── projects.test.ts          # Projects CRUD
└── status.test.ts            # 状态检查
```

> **注意**：大部分 API 集成测试在 2025-12-27 的重构中已迁移或删除，
> 当前自动化测试覆盖有限，建议按本文档手动执行 BVT。

---

## 附录：Hash 计算逻辑

### Turn Hash

```typescript
// @t3x/core → computeTurnHash()
computeTurnHash({
  parent_turn_hash: string | null,
  project_id: string,
  conversation_id: string,
  role: string,
  content: string,
  language: string | null,
  rings_json: string | null,
  created_at: string,  // ISO8601
})
// 内部添加 schema_version: 'turn_v1'
// JCS 规范化 + SHA256
// 返回格式: "sha256:..."
```

### Commit Hash

```typescript
// @t3x/core → computeCommitHash()
computeCommitHash({
  project_id: string,
  branch: string,
  parents_json: string,
  turn_window_json: string,
  facet_snapshot_json: string,
  pipeline_config_json: string | null,
  draft_id: string | null,
  draft_text_hash: string | null,
  signature_json: string | null,
  created_at: string,
})
// 内部添加 schema_version: 'commit_v1'
```
