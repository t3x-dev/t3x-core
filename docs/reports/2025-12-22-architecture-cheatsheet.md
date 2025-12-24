# T3X 架构速查手册

理解/背诵用的知识清单，基于 2025-12-22 集成测试验证后的代码。

---

## 1. Turn 链路

**POST /api/v1/turns 做了什么？**
```
1. 解析 JSON body（project_id, conversation_id, role, content, language, rings）
2. 校验必填字段 + role 合法性（user/assistant/system/tool）
3. 查 conversation 是否存在 + project 是否匹配
4. 调用 insertTurn() 写入 DB
5. 返回 snake_case 格式的 turn 对象
```

**调用了哪个 storage 函数？**
```typescript
import { insertTurn } from '@t3x/storage/pglite';
```
位置：`t3x-webui/src/app/api/v1/turns/route.ts:14`

**turn_hash 怎么来的？**
```
insertTurn 内部调用 @t3x/core 的 computeTurnHash()
输入：parent_turn_hash + project_id + conversation_id + role + content + language + rings_json + created_at
算法：JCS 规范化 → SHA-256 → "sha256:xxx" 前缀
```

**parent_turn_hash 怎么来的？**
```
insertTurn 内部查询该 conversation 的最后一条 turn，取其 turnHash 作为 parent
第一条 turn 的 parent_turn_hash 为 null
```

---

## 2. Conversation 链路

**conversation 跟 project 的关系？**
```
conversation.projectId 外键指向 project
创建 turn 时必须校验 conversation.projectId === body.project_id
```
位置：`t3x-webui/src/app/api/v1/turns/route.ts:131-136`

**turns 查询方式？**
```typescript
findTurnsByConversation(db, { conversationId, limit, offset, order })
```
返回该 conversation 下的所有 turns，支持分页和排序

---

## 3. Commit 链路

**turn_window vs merge_parents？**
```
二选一，互斥：
- turn_window: 普通 commit，指定 start_turn_hash → end_turn_hash 范围
- merge_parents: 合并 commit，指定多个父 commit hash
```
位置：`t3x-webui/src/app/api/v1/commits/route.ts:125-141`

**branch head 更新？**
```
insertCommit 内部自动：
1. 查找或创建 branch 记录
2. 更新 branch.headCommitHash = 新 commit 的 hash
```

**commit hash 怎么来的？**
```
insertCommit 内部调用 @t3x/core 的 computeCommitHash()
输入：parent_hashes + turn_window + facet_snapshot + pipeline_config + ...
算法：JCS 规范化 → SHA-256 → "sha256:xxx" 前缀
```

---

## 4. 分层架构

| 层 | 包 | 职责 |
|---|---|---|
| **Core** | `@t3x/core` | 纯逻辑：hash 计算、JCS 规范化，**不依赖 DB** |
| **Storage** | `@t3x/storage` | 数据层：Drizzle ORM、CRUD 操作、hash 链维护 |
| **WebUI** | `t3x-webui` | API 层：HTTP 路由、参数校验、格式转换（camelCase ↔ snake_case） |

**依赖方向：**
```
webui → storage → core
       ↑ 不能反向依赖
```

---

## 5. 测试保护什么 Contract

| 测试文件 | 保护的 Contract |
|---------|----------------|
| `turns.test.ts` | API 返回 hash == Core 重算 hash == DB 存储 hash |
| `commits.test.ts` | POST 后 DB 可查 + branch head 自动更新 |
| `conversations.test.ts` | project_id 关联正确 |

**核心不变量：**
```
Hash 确定性：相同输入 → 相同 hash（可重算验证）
Hash 链完整性：每个 turn 的 parent_turn_hash 指向前一条
```

---

## 6. 排查路径

**场景：turn 写入后查不到**
```
1. 检查 API 返回的 turn_hash
2. 用 findTurnByHash(db, hash) 查 DB
3. 如果 DB 无记录 → insertTurn 事务失败
4. 如果 DB 有记录但 API 返回不同 → hash 计算不一致
```

**场景：hash 不一致**
```
1. 对比 API 返回的 created_at 和 DB 的 createdAt
2. 检查 rings_json 是否正确 JSON.stringify
3. 用 computeTurnHash 手动重算，逐字段对比
```

**场景：branch head 未更新**
```
1. 检查 insertCommit 是否抛错
2. 用 findBranchByName(db, projectId, branch) 查 branch 记录
3. 对比 headCommitHash 和 commit_hash
```

---

## 7. Branch / Current Branch 语义

### 数据结构（Drizzle schema）
```typescript
// t3x-storage/src/schema.ts:86-101
branches = pgTable('branches', {
  branchId: text('branch_id').primaryKey(),
  projectId: text('project_id'),
  name: text('name'),
  parentBranch: text('parent_branch'),      // 分叉来源
  headCommitHash: text('head_commit_hash'), // 版本指针
  isCurrent: integer('is_current').default(0), // 0 或 1
  ...
});
```

### current branch 存在吗？怎么切换？

**存在**。每个 project 有且仅有一个 `isCurrent=1` 的 branch。

**切换逻辑**（`switchBranch`，`t3x-storage/src/queries/branches.ts:142-168`）：
```
1. 先把该 project 下所有 branch 的 isCurrent 改成 0
2. 再把目标 branch 的 isCurrent 改成 1
3. 返回更新后的 branch
```

**API 端点**：
| 接口 | 作用 |
|------|------|
| `GET /api/v1/branches/current?project_id=xxx` | 获取当前 branch |
| `POST /api/v1/branches/switch` | 切换 current branch |

### 创建 commit 的时候写到哪个 branch？

**不自动用 current branch**。POST `/api/v1/commits` 需要明确传 `branch` 参数：
```json
{ "project_id": "xxx", "branch": "main", ... }
```

如果不传 branch，`insertCommit` 会使用默认值（`'main'`）。

### branch head 和 current branch 的关系？

| 概念 | 含义 | 更新时机 |
|------|------|----------|
| `headCommitHash` | 该 branch 的最新 commit | `insertCommit` 后自动更新 |
| `isCurrent` | 该 project 的"工作分支" | `switchBranch` 时更新 |

**关系**：独立的两件事。`headCommitHash` 是版本指针，`isCurrent` 是 UI 默认选中哪个分支。

### 第一个 branch 自动变 current

```typescript
// t3x-storage/src/queries/branches.ts:36-41
const isCurrent = Number(countResult?.count ?? 0) === 0 ? 1 : 0;
```

---

## 8. Schema / 字段映射的"单点真相"

### 谁是 Source of Truth？

**Drizzle Schema**（`t3x-storage/src/schema.ts`）是唯一真相。

| 层 | 命名规范 | 来源 |
|---|---|---|
| DB | `camelCase`（Drizzle 字段名） | schema.ts 定义 |
| API | `snake_case`（JSON 响应） | route.ts 手动转换 |

### 转换在哪里做？有没有统一 helper？

**没有统一 helper**，每个 route.ts 手动写转换：

```typescript
// t3x-webui/src/app/api/v1/turns/route.ts:57-67
const apiTurns = turns.map((t) => ({
  turn_hash: t.turnHash,          // DB camelCase → API snake_case
  parent_turn_hash: t.parentTurnHash,
  project_id: t.projectId,
  ...
}));
```

### 如果某个字段名改了，要改哪三处？

| 改动点 | 文件位置 |
|--------|----------|
| 1. Schema | `t3x-storage/src/schema.ts` |
| 2. Route 转换 | `t3x-webui/src/app/api/v1/*/route.ts` |
| 3. 测试断言 | `t3x-webui/src/__tests__/api/*.test.ts` |

**额外风险**：如果字段参与 hash 计算，还要改 `computeTurnHash` / `computeCommitHash`。

---

## 9. 不变量的"范围边界"：哪些字段参与 Hash

### 哪些字段参与 Turn Hash？

```typescript
// t3x-core/src/storage/utils.ts:48-69
computeTurnHash({
  parent_turn_hash,    // ✅ 参与
  project_id,          // ✅ 参与
  conversation_id,     // ✅ 参与
  role,                // ✅ 参与
  content,             // ✅ 参与
  language,            // ✅ 参与
  rings_json,          // ✅ 参与
  created_at,          // ✅ 参与
  schema_version: 'turn_v1',  // ✅ 参与（硬编码）
});
```

**不参与的字段**：无（所有业务字段都参与）

### 哪些字段参与 Commit Hash？

```typescript
// t3x-core/src/storage/utils.ts:74-99
computeCommitHash({
  project_id,           // ✅ 参与
  branch,               // ✅ 参与
  parents_json,         // ✅ 参与
  turn_window_json,     // ✅ 参与
  facet_snapshot_json,  // ✅ 参与
  pipeline_config_json, // ✅ 参与
  draft_id,             // ✅ 参与
  draft_text_hash,      // ✅ 参与
  signature_json,       // ✅ 参与
  created_at,           // ✅ 参与
  schema_version: 'commit_v1',  // ✅ 参与（硬编码）
});
```

**不参与的字段**：
- `message`（commit message 是元数据，不影响 hash）
- `positionX`, `positionY`（UI 布局信息）
- `source_excerpt_json`, `must_have_json`, `mustnt_have_json`, `source_refs_json`

### created_at 放进 hash 的 tradeoff？

| 优点 | 缺点 |
|------|------|
| hash 链更强绑定，无法伪造时间 | 时间源必须一致 |
| 重放攻击更难 | 迁移/导入时必须保留原始时间 |
| 每个 turn 唯一（即使内容相同） | 不能用 hash 做去重 |

**当前设计决策**：created_at 由 API 层生成，写入 DB 后返回给客户端。测试用 API 返回的时间来重算，保证一致性。

### 未来改这些字段会影响什么？

| 改动 | 影响面 |
|------|--------|
| 添加字段到 hash | 所有旧 hash 失效，无法验证历史数据 |
| 移除字段从 hash | 可能产生 hash 碰撞 |
| 改 schema_version | 需要迁移脚本，新旧版本 hash 不兼容 |

---

## 10. 变更影响面清单

| 改什么 | 会影响哪些测试 | 会炸的症状 |
|--------|---------------|-----------|
| schema 字段名 | 所有查询/插入相关测试 | Drizzle 报 column 不存在 |
| API snake_case 名 | `*.test.ts` 的断言 | `expect(data.xxx)` undefined |
| hash 入参字段 | hash 一致性测试 | API hash ≠ Core 重算 hash |
| `schema_version` | 全部 hash 相关测试 | 所有 hash 值变化 |
| `isCurrent` 逻辑 | branches 测试 | switch 后 current 不对 |

---

## 核心记忆点

- **三层分工**：core 算 hash，storage 管 DB，webui 做 HTTP
- **hash 确定性**：JCS + SHA256，可重算验证
- **测试保护**：API == Core == DB 三方一致
- **branch 语义**：`headCommitHash` 是版本指针，`isCurrent` 是工作分支
- **字段映射**：Drizzle schema 是真相，route 手动转 snake_case
- **hash 边界**：message/position 不参与 hash，created_at 参与

---

*生成时间：2025-12-22*
