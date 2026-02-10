# T3X 产品路线图：执行层

> 状态：草案
> 最后更新：2026-02-09
> 范围：功能交付顺序与范围定义——回答"下周做什么"。
> 上游文档：`docs/product-strategy.md`（愿景层）、`docs/frontend-rules.md`（前端规范）、`docs/backend-rules.md`（后端规范）

---

## 目录

1. [执行原则](#1-执行原则)
2. [现状快照](#2-现状快照)
3. [Phase 0：P0 前提（规则能执行的基础）](#3-phase-0p0-前提)
4. [Phase 1：GitHub 化（治理闭环）](#4-phase-1github-化)
5. [Phase 2：Dagster 化（报告资产化）](#5-phase-2dagster-化)
6. [Phase 3：Notion 化（增长引擎）](#6-phase-3notion-化)
7. [明确不做的事](#7-明确不做的事)
8. [依赖关系图](#8-依赖关系图)

---

## 1. 执行原则

### 1.1 核心三角 vs. 增长手段

策略文档列了 8 个参考产品。执行层把它们分为两层：

```
核心三角（决定产品形态）：
  Figma   → Canvas 空间交互        ✅ 已完整
  GitHub  → Diff / Merge / Branch   ✅ 引擎完整，治理流程缺失
  Dagster → Trace / Eval / Report   ✅ 引擎完整，资产化缺失

增长手段（决定传播方式）：
  Notion  → 模板库 + 分享           ❌ 从零开始
  Vercel  → 预览链接               ❌ 从零开始
  n8n     → Webhook + 工作流        ⚠️ 仅 Runner 集成
  dbt     → 溯源链 + 约束验证       ✅ 已完整
  LangChain → Pin / Context         ✅ 已完整
```

**执行策略：先补完核心三角的缺失环节，再建增长手段。**

理由：没有完整的治理闭环和可分享的报告，模板库和分享链接没有东西可传播。

### 1.2 排序逻辑

```
Phase 0 → 补齐规则执行前提（不做 = 规则是空谈）
Phase 1 → 补完已有 80% 代码的方向（投入小、见效快）
Phase 2 → 补完已有 60% 代码的方向（中等投入）
Phase 3 → 从零建设增长引擎（投入大、但此时有内容可传播）
```

### 1.3 每个任务必须回答

| 问题 | 说明 |
|------|------|
| v0 范围是什么？ | 最小可交付物，不是完整愿景 |
| 已有什么代码？ | 具体文件路径和完成度 |
| 要新建什么？ | 文件列表 |
| 要改什么？ | 文件列表 |
| 不做什么？ | 明确排除项 |

---

## 2. 现状快照

基于代码库实际分析（2026-02-09）。

### 2.1 核心模块完成度

| 模块 | 核心引擎 | API | 存储 | WebUI | 缺失 |
|------|---------|-----|------|-------|------|
| Canvas（Figma） | ✅ XYFlow + ELK | — | — | ✅ 完整 | 语义缩放 |
| Diff（GitHub） | ✅ 词级 Diff | ✅ | ✅ | ✅ 统一/并排视图 | — |
| Merge（GitHub） | ✅ 二路合并 | ✅ 7 个端点 | ✅ merge_drafts 表 | ✅ 全屏工作区 | **审查步骤** |
| Branch（GitHub） | ✅ DAG | ✅ | ✅ | ✅ 分支过滤 | — |
| Trace（Dagster） | ✅ Span 层级 | ✅ | ✅ runs 表 | ✅ TraceTimeline | **报告资产化** |
| Eval（Dagster） | ✅ 断言引擎 | ✅ | ✅ | ✅ AssertionsSection | **报告资产化** |
| Deploy（Vercel） | ✅ Agent 管理 | ✅ | ✅ | ✅ A/B 对比 | **分享链接** |
| 溯源（dbt） | ✅ 句子→Turn | ✅ | ✅ | ✅ 字符级高亮 | — |
| Pin/Context（LangChain） | ✅ | ✅ | ✅ | ✅ | — |
| 模板（Notion） | ✅ 渲染引擎 + 8 默认模板 | ❌ | ❌ | ❌ | **Gallery 全部** |
| 分享（Notion/Vercel） | ❌ | ❌ | ❌ | ❌ | **全部** |
| 开发者模式 | ❌ | — | — | ❌ | **全部** |

### 2.2 关键数据

| 指标 | 值 |
|------|---|
| Git 术语直接暴露给用户的组件文件 | ~50+ 个 |
| 现有分享/预览代码 | 0 行 |
| 现有模板 Gallery 代码 | 0 行 |
| 现有 Developer Mode 代码 | 0 行 |
| Merge 系统已有代码完成度 | ~95%（缺审查步骤） |
| Runner 报告已有代码完成度 | ~60%（缺资产抽象） |
| 模板引擎已有代码完成度 | 100%（8 个默认模板 + 渲染 + 验证） |
| 认证/鉴权代码 | 0 行 |
| API 限流代码 | 0 行 |
| Webhook 注册系统代码 | 0 行 |

---

## 3. Phase 0：P0 前提

> 目标：让规则可执行、产品可上线。前端规则 + 后端基础设施双线并行。

### 3.0.1 Merge Review v0

**为什么是 P0**：策略核心是 GitHub 式治理闭环。当前合并是一键直接执行，没有确认步骤。

**已有的（不需要动）**：

| 层 | 文件 | 状态 |
|---|------|------|
| Core | `packages/core/src/merge/` | ✅ prepareMerge + executeMerge |
| API | `apps/api/src/routes/merge.openapi.ts` | ✅ 7 个端点（含 draft 工作流） |
| Storage | `packages/storage/` merge_drafts 表 | ✅ pending/committed/cancelled |
| WebUI | `apps/web/src/components/merge/` | ✅ MergeWorkspace + MergeActionBar + UnifiedDiffView + MergeConflictView + MergePreview |
| Store | `mergeWorkspaceStore.ts` | ✅ draft 持久化 + 自动保存 + 统计 |

**v0 范围（新建 + 修改）**：

| 动作 | 文件 | 内容 |
|------|------|------|
| **新建** | `components/merge/MergeReviewDialog.tsx` | 确认对话框：合并摘要 + Checks 清单 + 预览 + "确认合并" |
| 修改 | `components/merge/MergeActionBar.tsx` | "提交合并" → "审查并合并"，点击弹出 Dialog |
| 修改 | `store/mergeWorkspaceStore.ts` | 新增 `getMergeChecks()` 方法 |

**Checks 清单（v0）**：

```typescript
getMergeChecks: () => [
  { id: 'resolved',  label: '所有冲突已解决',     passed: unresolvedCount === 0 },
  { id: 'message',   label: '已填写合并说明',     passed: !!message.trim() },
  { id: 'sentences', label: '合并结果包含句子',   passed: previewSentences.length > 0 },
]
```

**v0 不做**：
- 不改数据库 schema（不加 pending_review/approved 状态）
- 不做多人审批流
- 不做 eval 自动触发
- 不做 Merge Checks API 端点

### 3.0.2 Developer Mode 切换 v0

**为什么是 P0**：规则 1 要求 80% 用户不见 Git 术语。但当前 UI 中 ~50+ 文件直接暴露 Commit/Branch/Merge/Hash。没有切换机制，规则 1 无法执行。

**已有的**：无。从零开始。

**v0 范围**：

| 动作 | 文件 | 内容 |
|------|------|------|
| **新建** | `store/settingsStore.ts` | `{ developerMode: boolean }`，persist 到 localStorage |
| **新建** | `hooks/useTerminology.ts` | 术语映射 Hook：`t('commit')` → 开发者模式返回 "Commit"，否则返回 "快照" |
| **新建** | `components/shared/SettingsToggle.tsx` | Sidebar 底部的开发者模式开关 |
| 修改 | `components/shared/Sidebar.tsx` | 添加设置开关入口 |

**v0 术语映射表**（仅高频词，首批替换）：

| key | 默认模式 | 开发者模式 |
|-----|---------|-----------|
| `commit` | 快照 | Commit |
| `branch` | 变体 | Branch |
| `merge` | 合并 | Merge |
| `diff` | 对比 | Diff |

**v0 替换范围**（首批，仅按钮/标题/Toast，~10 个文件）：
- Canvas 节点标签（Draft/Committed badge）
- MergeActionBar 按钮文字
- Command Palette 命令名
- 历史面板标题

**v0 不做**：
- 不做完整的 50+ 文件全量替换（Phase 1 逐步推进）
- 不隐藏 Hash（需要更多 UI 重构）
- 不做 i18n 框架（这不是多语言问题，是术语抽象问题）
- 不做设置页面（v0 只需要 Sidebar 一个开关）

### 3.0.3 预览/分享链接 v0

**为什么是 P0**：Notion/Vercel 传播机制的前提。没有分享能力，后续模板库和报告都无法传播。

**已有的**：

| 层 | 文件 | 状态 |
|---|------|------|
| 导出工具 | `apps/web/src/lib/export.ts` | ✅ formatLeafAsMarkdown + formatLeafAsJSON |
| Leaf 详情页 | `apps/web/src/app/project/[projectId]/leaf/[leafId]/page.tsx` | ✅ 完整渲染逻辑（可复用于只读视图） |

**v0 范围**：

| 动作 | 文件 | 内容 |
|------|------|------|
| **新建** | `packages/storage/src/queries/share-tokens.ts` | createShareToken / getShareToken / revokeShareToken |
| **新建** | `apps/api/src/routes/share.openapi.ts` | POST /v1/share（创建）、GET /v1/share/:token（获取）、DELETE /v1/share/:token（撤销） |
| **新建** | `apps/web/src/app/share/[token]/page.tsx` | 只读预览页（复用 Leaf 详情页渲染逻辑，禁用编辑） |
| **新建** | `components/shared/ShareLinkButton.tsx` | 生成链接 + 复制按钮 |
| 修改 | `packages/storage/src/schema-v4.ts` | 新增 share_tokens 表 |
| 修改 | `apps/api/src/index.ts` | 挂载 share 路由 |
| 修改 | Leaf 详情页 | 导出下拉菜单增加"分享链接"选项 |

**share_tokens 表（v0）**：

```typescript
export const shareTokens = pgTable('share_tokens', {
  token: text('token').primaryKey(),        // share_xxxxxxxxxxxx
  entityType: text('entity_type').notNull(), // 'leaf' (v0 仅支持 Leaf)
  entityId: text('entity_id').notNull(),     // leaf_abc123
  projectId: text('project_id').notNull(),
  createdAt: timestamp('created_at').notNull(),
  createdBy: text('created_by'),
  revokedAt: timestamp('revoked_at'),
});
```

**v0 约束**：
- 仅支持 Leaf 分享（Commit、Report 在后续 Phase 扩展）
- 同实例访问（不跨域、不上云）
- 无密码保护、无过期时间
- 无访问统计
- 只读，无交互

### 3.0.4 认证中间件 v0（纯后端）

**为什么是 P0**：当前 API 零认证——任何人可以调用任何端点。分享链接也无法区分"有权限"和"通过 token 的只读访问"。

**已有的**：CORS 中间件允许 `Authorization` Header（`allowHeaders: ['Content-Type', 'Authorization']`），但无验证逻辑。

**v0 范围**：

| 动作 | 文件 | 内容 |
|------|------|------|
| **新建** | `apps/api/src/middleware/auth.ts` | API Key 验证中间件 |
| **新建** | `packages/storage/src/queries/api-keys.ts` | API Key CRUD |
| 修改 | `packages/storage/src/schema-v4.ts` | 新增 api_keys 表 |
| 修改 | `apps/api/src/index.ts` | 注册 auth 中间件 |

**v0 设计**：

```
Header: Authorization: Bearer t3x_xxxxxxxxxxxxxxxx

中间件逻辑：
1. /health、/api/docs、/api/openapi.json → 跳过认证
2. /api/v1/share/:token → 跳过认证（分享 token 自带鉴权）
3. 其他所有 /api/v1/* → 验证 API Key
4. 无效/缺失 Key → 401 { code: 'UNAUTHORIZED' }
```

**v0 不做**：
- 不做用户系统（没有 signup/login）
- 不做 OAuth / JWT
- 不做 RBAC（不区分角色）
- 不做 per-endpoint 权限（v0 有 key = 全权限）

---

## 4. Phase 1：GitHub 化（治理闭环）

> 目标：补完策略 Milestone B 的核心——让合并变成"流程"而不是"按钮"。
> 前置：Phase 0 的 Merge Review v0 和 Developer Mode v0 已完成。

### 4.1 合并摘要（Layer 1）

**描述**：合并完成后自动生成人话摘要——"新增了什么、删除了什么、替换了什么"。

| 动作 | 文件 | 内容 |
|------|------|------|
| **新建** | `lib/mergeSummary.ts` | 纯函数：输入 Merge2WayResult + 用户决策，输出结构化摘要 |
| 修改 | `components/merge/MergeReviewDialog.tsx` | 在 Checks 上方展示摘要 |
| 修改 | Canvas 合并节点 | 展示摘要（Layer 1 始终可见） |

**摘要结构**：

```typescript
interface MergeSummary {
  kept_identical: number;      // 未变化句子数
  resolved_conflicts: number;  // 已解决冲突数
  kept_from_source: number;    // 从源保留
  kept_from_target: number;    // 从目标保留
  kept_both: number;           // 保留双方
  discarded: number;           // 丢弃数
  total_sentences: number;     // 最终句子总数
  highlight: string;           // 一句话摘要（如 "保留了 12 句，解决了 3 个冲突，丢弃了 1 句"）
}
```

**不做**：LLM 生成的自然语言摘要（v1 用规则生成，确定性优先）。

### 4.2 术语替换全量推进

在 v0 的 `useTerminology` 基础上，逐步替换剩余 ~40 个文件的 Git 术语。

**分批策略**：

| 批次 | 范围 | 文件数 |
|------|------|-------|
| 第 1 批（Phase 0 已完成） | 按钮、标题、Toast | ~10 |
| 第 2 批 | 节点 Modal 内容、面板标题 | ~15 |
| 第 3 批 | Diff 视图标签、Merge 工作区 | ~15 |
| 第 4 批 | 命令面板、Tooltip、空状态文字 | ~10 |

**验收标准**：Developer Mode 关闭时，UI 中搜索不到 "Commit"、"Branch"、"Merge"、"Diff"、"Hash" 的用户可见文字。

### 4.3 Merge Checks 增强

Phase 0 的 Checks 是纯前端。Phase 1 扩展为可配置的检查项：

| Check | 来源 | 实现层 |
|-------|------|-------|
| 所有冲突已解决 | 前端 | ✅ Phase 0 已有 |
| 已填写合并说明 | 前端 | ✅ Phase 0 已有 |
| 约束满足率 100% | API | 调用约束验证 |
| 证据链完整 | API | 检查所有句子都有 source_ref |

---

## 5. Phase 2：Dagster 化（报告资产化）

> 目标：补完策略 Milestone C 的核心——Runner 结果从"日志"变成"可分享的报告资产"。
> 前置：Phase 0 的分享链接 v0 已完成。

### 5.1 现状

| 已有 | 缺失 |
|------|------|
| runs 表 + run_id 主键 | "Report" 抽象层（标题、描述、标签） |
| 完整 Trace/Eval/Assertions 数据 | 分享机制 |
| A/B 对比页面 + 统计显著性检验 | 保存的对比快照 |
| RunsTable + TraceTimeline + SpanCard | 导出格式（Markdown/JSON） |

### 5.2 Report 资产化

| 动作 | 文件 | 内容 |
|------|------|------|
| 修改 | `packages/storage/src/schema.ts` | runs 表增加 title、description、tags 字段 |
| 修改 | `apps/api/src/routes/runs.openapi.ts` | PATCH /v1/runs/:runId（更新标题/描述/标签） |
| **新建** | `apps/web/src/components/optimiser/ReportHeader.tsx` | 可编辑标题 + 描述 + 标签 |
| 修改 | Deploy 详情页 | 集成 ReportHeader |

### 5.3 Report 分享

复用 Phase 0 的 share_tokens 基础设施：

| 动作 | 内容 |
|------|------|
| 修改 share_tokens | entityType 支持 'run' |
| **新建** | `apps/web/src/app/share/[token]/run/page.tsx`（只读 Report 视图） |
| 修改 Deploy 详情页 | 增加 ShareLinkButton |

### 5.4 Report 导出

| 动作 | 文件 | 内容 |
|------|------|------|
| **新建** | `apps/web/src/lib/exportReport.ts` | formatRunAsMarkdown + formatRunAsJSON |
| 修改 Deploy 详情页 | 增加导出下拉菜单 |

### 5.5 对比快照

| 动作 | 内容 |
|------|------|
| **新建** | `packages/storage/src/schema-v4.ts` 增加 saved_comparisons 表 |
| **新建** | API 端点：POST /v1/comparisons + GET /v1/comparisons/:id |
| 修改 | `/deploy/compare` 页面增加"保存对比"按钮 |

---

## 6. Phase 3：Notion 化（增长引擎）

> 目标：补完策略 Milestone A——让 T3X 有可传播的内容。
> 前置：Phase 0-2 完成后，有完整的 Leaf、Report、对比可分享。

### 6.1 现状

| 已有 | 缺失 |
|------|------|
| 模板引擎（renderTemplate + validateTemplateSyntax） | Gallery UI |
| 8 个默认模板（tweet/article/email/slack/wechat/weibo/deploy_agent/eval） | 模板 CRUD |
| 变量系统（formattedSentences/formattedConstraints/leafTitle 等） | 模板数据库存储 |
| 模板优先级逻辑（custom > config > default） | 搜索/筛选 |

### 6.2 模板库 v0

| 动作 | 文件 | 内容 |
|------|------|------|
| **新建** | `packages/storage/src/schema-v4.ts` 增加 templates 表 | template_id, title, description, category, leaf_type, system_prompt, user_prompt, variables, tags, is_builtin |
| **新建** | `apps/api/src/routes/templates.openapi.ts` | CRUD + 搜索 |
| **新建** | `apps/web/src/app/templates/page.tsx` | Gallery 页面：卡片网格 + 搜索 + 分类筛选 |
| **新建** | `apps/web/src/components/templates/TemplateCard.tsx` | 模板卡片（标题 + 描述 + 标签 + "使用" 按钮） |
| **新建** | `apps/web/src/components/templates/TemplatePreviewDialog.tsx` | 预览 Modal：约束、提示词模板、示例输出 |
| **新建** | `store/templateStore.ts` | 列表 + 搜索 + 筛选状态 |
| 修改 | Sidebar | 增加"模板库"导航入口 |

**数据迁移**：将现有 8 个默认模板从 `packages/core/src/leaf/templates/defaults.ts` 导入 templates 表（is_builtin = true）。

### 6.3 一键使用

| 动作 | 内容 |
|------|------|
| 修改 Canvas | "创建 Leaf" 面板增加"从模板创建"入口 |
| **新建** | "使用此模板" → 创建预填约束和配置的新 Leaf（直接跳转 Leaf 详情页） |

### 6.4 导出增强

Phase 0 已有 Leaf 的 Markdown/JSON 导出。Phase 3 统一所有资产的导出：

| 资产 | Markdown | JSON | Prompt 文本 |
|------|----------|------|------------|
| Leaf | ✅ Phase 0 | ✅ Phase 0 | **新建** |
| Commit | **新建** | **新建** | — |
| Report | ✅ Phase 2 | ✅ Phase 2 | — |
| 模板 | **新建** | **新建** | **新建** |

---

## 7. 明确不做的事

每个参考产品的"不学"清单。

| 参考产品 | 不做 | 理由 |
|---------|------|------|
| **GitHub** | Issue 系统 | T3X 不是项目管理工具 |
| **GitHub** | Actions / CI 流水线 | 用 n8n 工作流代替 |
| **GitHub** | 多人审批流（v1） | v0 本地两步确认即可 |
| **Figma** | 多人实时协作 / CRDT | 复杂度极高，v1 不做 |
| **Figma** | 评论/标注系统 | 不是设计工具 |
| **Notion** | 富文本编辑器（Prosemirror/Tiptap/Slate） | 规则 10：T3X 是结构化编辑 |
| **Notion** | Database 视图（表格/看板/日历） | 不是知识库 |
| **Vercel** | CI/CD 部署管道 | T3X 的 "Deploy" 是 Agent 部署，不是代码部署 |
| **Vercel** | Edge Functions / Serverless | 不是云平台 |
| **n8n** | 可视化工作流编辑器（v1） | 先做配方 + Webhook（策略已确认） |
| **n8n** | 节点市场 | 生态放在模板库，不在工作流 |
| **Dagster** | Asset Graph 可视化编辑 | Canvas 已有 DAG，不需要另一套 |
| **dbt** | SQL 建模 | 不是数据工程工具 |
| **LangChain** | 任意 Provider 热插拔 | 确定性核心优先 |

---

## 8. 依赖关系图

```
Phase 0（P0 前提）
├── 3.0.1 Merge Review v0 [前端] ───────┐
├── 3.0.2 Developer Mode v0 [前端] ─────┤
├── 3.0.3 分享链接 v0 [前后端] ─────────┤
└── 3.0.4 认证中间件 v0 [后端] ─────────┤
                                         │
Phase 1（GitHub 化）                     │
├── 4.1 合并摘要 [前端] ← 依赖 3.0.1   │
├── 4.2 术语全量替换 [前端] ← 依赖 3.0.2│
└── 4.3 Merge Checks 增强 [前后端] ← 依赖 3.0.1
                                         │
Phase 2（Dagster 化）                    │
├── 5.2 Report 资产化 [前后端]           │
├── 5.3 Report 分享 [前后端] ← 依赖 3.0.3│
├── 5.4 Report 导出 [前端]              │
└── 5.5 对比快照 [前后端]               │
                                         │
Phase 3（Notion 化）                     │
├── 6.2 模板库 v0 [前后端]              │
├── 6.3 一键使用 [前端] ← 依赖 6.2     │
└── 6.4 导出增强 [前端] ← 依赖 3.0.3 + 5.4│
```

**1 前端 + 1 后端并行方案**：

```
        Day 1-2       Day 3-4       Day 5-7       Day 8+
前端:   3.0.1         3.0.2         3.0.3 前端     Phase 1（4.1/4.2）
        (Merge        (Developer    (ShareLink     (合并摘要 /
        Review v0)    Mode v0)      Button+Page)   术语替换)

后端:   3.0.3 契约    3.0.3 后端    3.0.4          Phase 1（4.3）
        (写契约→      (share API    (Auth 中间件   (Merge Checks
        前端 Review)  实现)         v0)            API)
```

Phase 0 完成后进入 Phase 1/2 并行：
- 前端：4.1 合并摘要 → 4.2 术语替换 → 5.4 Report 导出
- 后端：4.3 Merge Checks API → 5.2 Report 元数据 → 5.5 对比快照 → 6.2 模板 CRUD API
