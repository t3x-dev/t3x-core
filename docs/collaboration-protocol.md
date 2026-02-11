# T3X 双人并行开发协作协议

> 状态：生效中
> 最后更新：2026-02-10
> 范围：1 前端 + 1 后端的并行开发协作规则。
> 上游文档：`product-roadmap.md`（执行层）、`frontend-rules.md`（前端规范）、`backend-rules.md`（后端规范）

---

## 目录

1. [文档阅读矩阵](#1-文档阅读矩阵)
2. [职责边界](#2-职责边界)
3. [契约优先工作流](#3-契约优先工作流)
4. [任务分类与所有权](#4-任务分类与所有权)
5. [Phase 0 契约定义](#5-phase-0-契约定义)
6. [Phase 1-3 契约清单](#6-phase-1-3-契约清单)
7. [日常协作规则](#7-日常协作规则)

---

## 1. 文档阅读矩阵

不按"前端文档 / 后端文档"分，按"必读 / 了解 / 参考"分。

| 文档 | 前端 | 后端 | 说明 |
|------|------|------|------|
| `product-strategy.md` | **必读** | **必读** | 理解为什么做，对齐产品方向 |
| `product-roadmap.md` | **必读** | **必读** | 理解做什么、什么顺序、谁做什么 |
| `frontend-rules.md` | **必读** | 了解 | 前端规范。后端需要了解术语表和三层模型（影响 API 返回字段） |
| `backend-rules.md` | 了解 | **必读** | 后端规范。前端需要了解 API 设计规范和错误码体系 |
| `frontend-design-principles.md` | **必读** | 参考 | 设计原则。后端在设计 API 字段时参考 |
| `CLAUDE.md` | **必读** | **必读** | 项目架构、数据格式、ID 规范、环境配置 |
| `apps/api/README.md` | 了解 | **必读** | API 架构和路由规范 |
| `packages/core/README.md` | 参考 | **必读** | 核心算法和类型定义 |
| `packages/storage/README.md` | 参考 | **必读** | 存储层架构 |

---

## 2. 职责边界

### 2.1 代码所有权

```
后端拥有（后端写，前端只读）：
├── packages/core/src/types/          ← 类型定义（契约源头）
├── packages/storage/src/schema*.ts   ← 数据库 Schema
├── packages/storage/src/queries/     ← 查询函数
├── apps/api/src/schemas/             ← API Zod 契约
├── apps/api/src/routes/              ← API 路由实现
└── apps/api/src/index.ts             ← 路由挂载

前端拥有（前端写，后端只读）：
├── apps/web/src/components/          ← UI 组件
├── apps/web/src/store/               ← 状态管理
├── apps/web/src/hooks/               ← 自定义 Hook
├── apps/web/src/app/                 ← 页面路由
└── apps/web/src/lib/                 ← 前端工具函数

共同修改（需要双方 Review）：
├── packages/core/src/types/v4/index.ts    ← 核心类型
├── apps/api/src/schemas/v4-contracts.ts   ← API 契约
├── apps/web/src/lib/api.ts                ← 前端 API 调用层
└── docs/                                  ← 文档
```

### 2.2 灰色地带规则

| 场景 | 谁做 | 理由 |
|------|------|------|
| `lib/api.ts` 新增 API 调用函数 | **前端** | 前端更清楚调用时机和错误处理 |
| `@t3x/core` 新增类型 | **后端** | 类型从数据库 Schema 推导，后端更清楚字段含义 |
| 纯前端计算函数（如 mergeSummary） | **前端** | 不涉及 API |
| 导出函数（formatAs*） | **前端** | 纯客户端功能 |
| API 端点参数设计 | **后端提案，前端确认** | 后端知道数据能力，前端知道 UI 需求 |

---

## 3. 契约优先工作流

### 3.1 跨边界功能的开发流程

```
Step 1: 后端写契约（类型 + Zod Schema + 端点签名）
        ↓
Step 2: 前端 Review 契约（确认字段满足 UI 需求）
        ↓  ← 如果不够，回到 Step 1 修改
Step 3: 双方同时开发
        │
        ├── 后端：Schema → Queries → Route 实现 → 测试
        │
        └── 前端：根据契约类型写 mock → 组件 → Store → 集成
        ↓
Step 4: 集成联调（后端 API 跑通后，前端切换到真实 API）
        ↓
Step 5: 双方各自补测试
```

### 3.2 契约文件修改规则

| 文件 | 谁能改 | 流程 |
|------|--------|------|
| `packages/core/src/types/v4/index.ts` | 后端改，前端 Review | PR 必须双方 Approve |
| `apps/api/src/schemas/v4-contracts.ts` | 后端改，前端 Review | PR 必须双方 Approve |
| `packages/storage/src/schema-v4.ts` | 后端改 | 前端不需要 Review |

**规则：契约一旦 Approve，实现阶段不能单方面修改。** 需要改 → 提 PR → 双方 Review → 合并。

### 3.3 前端 Mock 策略

前端不等后端 API 完成。契约 Approve 后立刻用 mock 开发：

```typescript
// apps/web/src/lib/api.ts

// 契约已定，API 未完成 → 用 mock
export async function createShareToken(
  entityType: string,
  entityId: string,
  projectId: string
): Promise<ShareToken> {
  // TODO: 替换为真实 API（后端完成后）
  if (process.env.NODE_ENV === 'development' && USE_MOCK) {
    return {
      token: `share_mock_${Date.now()}`,
      entity_type: entityType,
      entity_id: entityId,
      project_id: projectId,
      created_at: new Date().toISOString(),
      revoked_at: null,
    };
  }

  const res = await fetchWithTimeout(`${API_V1}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entity_type: entityType,
      entity_id: entityId,
      project_id: projectId,
    }),
  });
  return handleResponse<ShareToken>(res);
}
```

---

## 4. 任务分类与所有权

路线图中每个任务的实际分工。

### 4.1 任务类型

| 类型 | 含义 | 协作要求 |
|------|------|---------|
| **F** | 纯前端 | 前端独立完成，无需契约 |
| **B** | 纯后端 | 后端独立完成，无需契约 |
| **FB** | 跨边界 | **必须先写契约**，双方并行开发 |

### 4.2 Phase 0 任务分工

| 任务 | 类型 | 前端做什么 | 后端做什么 |
|------|------|-----------|-----------|
| **3.0.1 Merge Review v0** | **F** | MergeReviewDialog + ActionBar 修改 + getMergeChecks | 无（API 已完整） |
| **3.0.2 Developer Mode v0** | **F** | settingsStore + useTerminology + SettingsToggle + 首批替换 | 无（不涉及 API） |
| **3.0.3 分享链接 v0** | **FB** | ShareLinkButton + share/[token] 页面 + api.ts 调用 | **ShareToken 类型 + schema + queries + API 路由** |
| **3.0.4 认证中间件 v0** | **B** | 无 | **API Key 中间件 + api_keys 表 + 白名单路由** |

**Phase 0 并行方案**：

```
前端: 3.0.1（Merge Review v0）→ 3.0.2（Developer Mode v0）→ 3.0.3 前端部分
后端: 3.0.3 契约 → 3.0.3 后端实现 → 3.0.4 认证中间件

时间线：
Day 1-2:  前端做 3.0.1 | 后端写 3.0.3 契约 → 前端 Review
Day 3-4:  前端做 3.0.2 | 后端实现 3.0.3 API
Day 5-6:  前端做 3.0.3 前端部分 | 后端做 3.0.4 认证中间件
Day 7:    集成联调 3.0.3 + 3.0.4
```

### 4.3 Phase 1 任务分工

| 任务 | 类型 | 前端 | 后端 |
|------|------|------|------|
| 4.1 合并摘要 | **F** | mergeSummary 纯函数 + UI | 无 |
| 4.2 术语全量替换 | **F** | 逐批替换 ~40 个文件 | 无 |
| 4.3 Merge Checks 增强 | **FB** | Checks 展示 UI | 约束验证 + 证据链检查 API 端点 |

### 4.4 Phase 2 任务分工

| 任务 | 类型 | 前端 | 后端 |
|------|------|------|------|
| 5.2 Report 资产化 | **FB** | ReportHeader 组件 | runs 表增字段 + PATCH API |
| 5.3 Report 分享 | **FB** | 只读 Report 视图 | share_tokens 扩展 entityType='run' |
| 5.4 Report 导出 | **F** | exportReport.ts | 无 |
| 5.5 对比快照 | **FB** | "保存对比" UI | saved_comparisons 表 + CRUD API |

### 4.5 Phase 3 任务分工

| 任务 | 类型 | 前端 | 后端 |
|------|------|------|------|
| 6.2 模板库 v0 | **FB** | Gallery 页面 + 组件 | templates 表 + CRUD API + 搜索 |
| 6.3 一键使用 | **F** | Canvas "从模板创建" 流程 | 无（复用 createLeaf API） |
| 6.4 导出增强 | **F** | 统一导出函数 | 无 |

### 4.6 总结

| Phase | 纯前端 | 纯后端 | 跨边界 |
|-------|--------|--------|--------|
| 0 | 2 | 1 | 1 |
| 1 | 2 | 0 | 1 |
| 2 | 1 | 0 | 3 |
| 3 | 2 | 0 | 1 |
| **总计** | **7** | **1** | **6** |

前端功能任务较多，但后端的基础设施工作（认证、限流、Webhook）不在上表中——这些是后端独立的持续建设项，详见 `backend-rules.md` 第 10 节。

---

## 5. Phase 0 契约定义

Phase 0 唯一的跨边界任务是 **3.0.3 分享链接 v0**。以下是完整契约。

### 5.1 核心类型

```typescript
// packages/core/src/types/v4/index.ts 新增

export interface ShareToken {
  token: string;             // share_xxxxxxxxxxxx
  entity_type: 'leaf';       // v0 仅支持 leaf
  entity_id: string;         // leaf_abc123
  project_id: string;        // proj_xxx
  created_at: string;        // ISO8601
  created_by: string | null;
  revoked_at: string | null; // null = 有效
}

export interface CreateShareTokenInput {
  entity_type: 'leaf';
  entity_id: string;
  project_id: string;
  created_by?: string;
}

// ID 前缀
export const ID_PREFIXES = {
  // ... 现有
  share_token: 'share_',
};
```

### 5.2 数据库 Schema

```typescript
// packages/storage/src/schema-v4.ts 新增

export const shareTokens = pgTable('share_tokens', {
  token: text('token').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  projectId: text('project_id').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  createdBy: text('created_by'),
  revokedAt: timestamp('revoked_at'),
});
```

### 5.3 API 契约

```typescript
// apps/api/src/schemas/v4-contracts.ts 新增

// --- 请求 ---

export const CreateShareTokenRequest = z.object({
  entity_type: z.literal('leaf'),
  entity_id: z.string().min(1),
  project_id: z.string().min(1),
});

// --- 响应 ---

export const ShareTokenResponse = z.object({
  token: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  project_id: z.string(),
  created_at: z.string(),
  created_by: z.string().nullable(),
  revoked_at: z.string().nullable(),
});

// 解析 token 时返回实体数据（前端渲染只读页面用）
export const ResolveShareTokenResponse = z.object({
  token_info: ShareTokenResponse,
  entity: z.any(),  // v0: Leaf 对象；后续扩展其他类型
});
```

### 5.4 API 端点

| 方法 | 路径 | 请求体 | 响应 | 说明 |
|------|------|--------|------|------|
| `POST` | `/v1/share` | `CreateShareTokenRequest` | `{ success, data: ShareTokenResponse }` | 创建分享 token |
| `GET` | `/v1/share/:token` | — | `{ success, data: ResolveShareTokenResponse }` | 解析 token，返回实体数据 |
| `DELETE` | `/v1/share/:token` | — | `{ success, data: { revoked: true } }` | 撤销分享 |

### 5.5 前端调用签名

```typescript
// apps/web/src/lib/api.ts 新增

export async function createShareToken(
  entityType: 'leaf',
  entityId: string,
  projectId: string
): Promise<ShareToken> { ... }

export async function resolveShareToken(
  token: string
): Promise<{ token_info: ShareToken; entity: Leaf }> { ... }

export async function revokeShareToken(
  token: string
): Promise<void> { ... }
```

### 5.6 前端路由

```
/share/[token]  →  只读预览页
  - 调用 resolveShareToken(token)
  - 根据 entity_type 渲染对应只读视图
  - v0: entity_type === 'leaf' → 复用 Leaf 详情页渲染逻辑，禁用编辑
  - token 无效/已撤销 → 展示错误页
```

---

## 6. Phase 1-3 契约清单

后续 Phase 的跨边界任务，后端应在前一个 Phase 执行期间**提前写好契约**。

### Phase 1: Merge Checks 增强（4.3）

| 契约内容 | 说明 |
|---------|------|
| `GET /v1/merge/drafts/:id/checks` | 返回检查项列表 |
| `MergeCheck` 类型 | `{ id, label, passed, details? }` |
| 检查项 | constraints_satisfied, evidence_chain_complete, 可选 eval_passed |

### Phase 2: Report 资产化（5.2）

| 契约内容 | 说明 |
|---------|------|
| `PATCH /v1/runs/:runId` | 更新 title、description、tags |
| runs 表新增字段 | title, description, tags (jsonb) |
| `RunMetadata` 类型扩展 | 新增 title, description, tags |

### Phase 2: 对比快照（5.5）

| 契约内容 | 说明 |
|---------|------|
| `saved_comparisons` 表 | comparison_id, project_id, run_ids[], title, config, result_snapshot |
| `POST /v1/comparisons` | 创建保存的对比 |
| `GET /v1/comparisons/:id` | 获取对比详情 |
| `GET /v1/comparisons?project_id=` | 列出项目的对比 |

### Phase 3: 模板库（6.2）

| 契约内容 | 说明 |
|---------|------|
| `templates` 表 | template_id, title, description, category, leaf_type, system_prompt, user_prompt, variables, tags, is_builtin |
| `GET /v1/templates` | 列表 + 搜索 + 分类筛选 |
| `GET /v1/templates/:id` | 模板详情 |
| `POST /v1/templates` | 创建（社区贡献） |

---

## 7. 日常协作规则

### 7.1 分支策略

```
main
├── feat/merge-review-v0         ← 前端
├── feat/developer-mode-v0       ← 前端
├── feat/share-link-backend      ← 后端
├── feat/share-link-frontend     ← 前端
└── ...
```

跨边界功能用两个分支（backend + frontend），先合 backend，再合 frontend。

### 7.2 PR 规则

| 类型 | Reviewer | 合并条件 |
|------|----------|---------|
| 纯前端 PR | 后端（了解即可） | 前端 Approve |
| 纯后端 PR | 前端（了解即可） | 后端 Approve |
| 契约修改 PR | **双方必须 Approve** | 双方 Approve |
| 跨边界功能 backend PR | 前端确认契约未偏离 | 双方 Approve |
| 跨边界功能 frontend PR | 后端确认调用方式正确 | 双方 Approve |

### 7.3 沟通节点

不需要每天站会，但这些节点必须同步：

| 时机 | 内容 | 形式 |
|------|------|------|
| 契约 Review | 后端提交契约 PR，前端在 PR 上评论 | GitHub PR |
| 联调开始 | 后端 API 部署到 dev 环境，前端切换 mock → 真实 | 消息通知 |
| 联调问题 | API 响应与契约不一致 | Issue / 消息 |
| Phase 切换 | 当前 Phase 完成，确认下一个 Phase 的契约 | 简短会议 |

### 7.4 后端任务排列

Phase 0 中后端有自己的独立工作（3.0.3 后端 + 3.0.4 认证），不存在空闲期。后端推进顺序：

| 优先级 | 任务 | 说明 |
|--------|------|------|
| 1 | 3.0.3 分享 Token 契约 + 实现 | 前端 3.0.3 依赖 |
| 2 | 3.0.4 认证中间件 v0 | 产品上线前提 |
| 3 | Phase 1 Merge Checks API 契约 + 实现 | 前端 4.3 依赖 |
| 4 | Phase 2 Report 元数据 Schema + API | 前端 5.2 依赖 |
| 5 | Phase 2 对比快照 Schema + API | 前端 5.5 依赖 |
| 6 | Phase 3 模板 CRUD API | 前端 6.2 依赖 |

### 7.5 冲突预防

| 风险 | 预防措施 |
|------|---------|
| 双方同时改 `v4-contracts.ts` | **后端独占修改权**，前端通过 PR 评论提需求 |
| 前端 mock 和真实 API 行为不一致 | mock 必须严格按契约类型返回，字段名/类型/null 处理完全一致 |
| API 字段不满足 UI 需求 | **契约 Review 阶段**解决，不在实现阶段改 |
| 数据库迁移冲突 | 后端独占 schema 文件，前端不碰 |
| `lib/api.ts` 两人同时改 | 前端拥有此文件。后端如需改动，提 PR 让前端 Review |
